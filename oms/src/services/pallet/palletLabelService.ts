// Phase 10 — pallet label service.
//
// Mints a physical "pallet barcode" after weighing completes. Staff
// prints, sticks on the pallet, and the pallet sits until the client
// confirms label generation. Once the client confirms (via OMS), the
// label-print page lets staff scan the pallet barcode to find and
// proceed with the outbound.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase, getMongoClient } from "@/lib/mongo";
import { logAudit } from "@/services/audit/log";
import { nextDailyId } from "@/services/util/daily-counter";
import {
  PalletLabelPublic,
  projectPalletLabel,
} from "@/types/PickBatch";

export interface PalletStaffCtx {
  staff_id: string;
  warehouseCode?: string;
  ip_address?: string;
  user_agent?: string;
}

const PRINT_ELIGIBLE_OUTBOUND_STATUS = new Set([
  "weight_verified",
  "pending_client_label",
]);

/**
 * Mint a pallet label for the given outbound. Called automatically at
 * the end of completeWeighing (system actor) and from a manual reprint
 * endpoint (staff actor).
 *
 * Idempotency: re-calling for an outbound that already has a pallet
 * label increments reprint_count + returns the existing record.
 */
export async function printPallet(
  ctx: PalletStaffCtx,
  outbound_id: string,
  actor_type: "system" | "wms_staff" = "wms_staff"
): Promise<PalletLabelPublic> {
  const db = await connectToDatabase();
  const ob = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  if (!ob) {
    throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outbound_id });
  }
  if (!PRINT_ELIGIBLE_OUTBOUND_STATUS.has(ob.status)) {
    throw new ApiError("PALLET_LABEL_OUTBOUND_NOT_READY", {
      outboundId: outbound_id,
      status: ob.status,
    });
  }

  // Existing label? → reprint.
  const existing = await db
    .collection(collections.PALLET_LABEL)
    .findOne({ outbound_id });
  if (existing) {
    const now = new Date();
    await db.collection(collections.PALLET_LABEL).updateOne(
      { _id: existing._id },
      {
        $inc: { reprint_count: 1 },
        $set: { last_reprint_at: now, updatedAt: now },
      }
    );
    await logAudit({
      action: AUDIT_ACTIONS.pallet_label_reprinted,
      actor_type:
        actor_type === "system"
          ? AUDIT_ACTOR_TYPES.system
          : AUDIT_ACTOR_TYPES.wms_staff,
      actor_id: actor_type === "system" ? null : ctx.staff_id,
      target_type: AUDIT_TARGET_TYPES.pallet_label,
      target_id: String(existing._id),
      details: { outbound_id, reprint_count: (existing.reprint_count ?? 0) + 1 },
      warehouse_code: ctx.warehouseCode,
    });
    const after = await db
      .collection(collections.PALLET_LABEL)
      .findOne({ _id: existing._id });
    return projectPalletLabel(after);
  }

  // Fresh print: snapshot box_count + total_weight from current state.
  const boxes = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id })
    .toArray();
  const total_weight_kg = boxes.reduce(
    (s: number, b: any) => s + (b.weight_actual ?? 0),
    0
  );
  const _id = await nextDailyId("PL");
  const now = new Date();
  const doc = {
    _id: _id as any,
    pallet_no: _id,
    batch_id: ob.batch_id ?? null,
    outbound_id,
    client_id: ob.client_id,
    box_count: boxes.length,
    total_weight_kg,
    carrier_code: ob.carrier_code,
    destination_country: ob.destination_country,
    printed_at: now,
    printed_by_staff_id: ctx.staff_id,
    reprint_count: 0,
    last_reprint_at: null,
    scanned_back_at: null,
    scanned_back_by_staff_id: null,
    createdAt: now,
    updatedAt: now,
  };

  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.PALLET_LABEL).insertOne(doc as any, {
        session,
      });
      // Stamp pallet_label_id onto every box so post-depart reporting can
      // attribute boxes to a pallet (e.g. "which pallet did this box ship on?").
      await db
        .collection(collections.OUTBOUND_BOX)
        .updateMany(
          { outbound_id, pallet_label_id: { $in: [null, undefined] as any } },
          { $set: { pallet_label_id: _id, updatedAt: now } },
          { session }
        );
    });
  } finally {
    await session.endSession();
  }

  await logAudit({
    action: AUDIT_ACTIONS.pallet_label_printed,
    actor_type:
      actor_type === "system"
        ? AUDIT_ACTOR_TYPES.system
        : AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: actor_type === "system" ? null : ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.pallet_label,
    target_id: _id,
    details: {
      outbound_id,
      box_count: boxes.length,
      total_weight_kg,
    },
    warehouse_code: ctx.warehouseCode,
  });
  return projectPalletLabel(doc);
}

/**
 * Resolve a pallet barcode at the label-print page: returns the
 * underlying outbound_id so the UI can load the existing print flow.
 * Records the scan-back for audit.
 */
export interface ScanBackResult {
  pallet: PalletLabelPublic;
  outbound_id: string;
  outbound_status: string;
}

export async function scanBackPallet(
  ctx: PalletStaffCtx,
  pallet_no: string
): Promise<ScanBackResult> {
  const db = await connectToDatabase();
  const pallet = await db
    .collection(collections.PALLET_LABEL)
    .findOne({ pallet_no });
  if (!pallet) {
    throw new ApiError("PALLET_LABEL_NOT_FOUND", { palletNo: pallet_no });
  }
  const ob = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: pallet.outbound_id as any });

  // Only record the first scan-back; subsequent scans are no-ops on the
  // pallet record (the UI may still use the same pallet barcode multiple
  // times if staff misplaces the package).
  if (!pallet.scanned_back_at) {
    const now = new Date();
    await db.collection(collections.PALLET_LABEL).updateOne(
      { _id: pallet._id },
      {
        $set: {
          scanned_back_at: now,
          scanned_back_by_staff_id: ctx.staff_id,
          updatedAt: now,
        },
      }
    );
    await logAudit({
      action: AUDIT_ACTIONS.pallet_label_scanned_back,
      actor_type: AUDIT_ACTOR_TYPES.wms_staff,
      actor_id: ctx.staff_id,
      target_type: AUDIT_TARGET_TYPES.pallet_label,
      target_id: String(pallet._id),
      details: { outbound_id: pallet.outbound_id },
      warehouse_code: ctx.warehouseCode,
    });
  }

  const updated = await db
    .collection(collections.PALLET_LABEL)
    .findOne({ _id: pallet._id });
  return {
    pallet: projectPalletLabel(updated),
    outbound_id: pallet.outbound_id,
    outbound_status: ob?.status ?? "unknown",
  };
}

export async function getPallet(
  pallet_no: string
): Promise<PalletLabelPublic | null> {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.PALLET_LABEL)
    .findOne({ pallet_no });
  return doc ? projectPalletLabel(doc) : null;
}

export const palletLabelService = {
  printPallet,
  scanBackPallet,
  getPallet,
};

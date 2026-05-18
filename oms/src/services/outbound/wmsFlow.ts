// Phase 8 — WMS outbound flow (pick / pack / weigh / label / depart).
//
// All entry points are server-side service functions used by both:
//   - WMS staff-facing UI (desktop /operations/* + PDA /scan/*)
//   - admin admin retry paths via /api/cms/admin/outbound/*
//
// We keep this file flat (no class wrapping) to match the other v1
// services. Each top-level function is independently testable and writes
// audit/scan rows for the corresponding stage transition.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase, getMongoClient } from "@/lib/mongo";
import { logAudit } from "@/services/audit/log";
import { createNotification } from "@/services/notification/notification";
import { walletService } from "@/services/wallet/walletService";
import {
  getCarrierAdapter,
  rateQuoteWithLog,
} from "@/services/carrier/carrierAdapter";
import { pickBatchService } from "@/services/pickBatch/pickBatchService";
import { nextDailyId } from "@/services/util/daily-counter";
import { palletLabelService } from "@/services/pallet/palletLabelService";
import {
  OutboundBoxPublic,
  OutboundStatusV1,
  projectOutboundBox,
  projectOutboundV1,
} from "@/types/OutboundV1";
import { ObjectId } from "mongodb";

export interface StaffContext {
  staff_id: string;
  warehouseCode?: string;
  ip_address?: string;
  user_agent?: string;
}

// ── tunables ─────────────────────────────────────────────────

const WEIGHT_TOLERANCE_KG = 0.5;

// ── helpers ──────────────────────────────────────────────────

async function getOutbound(db: any, outbound_id: string) {
  const doc = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  if (!doc) {
    throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outbound_id });
  }
  return doc;
}

function shortOutboundId(outbound_id: string): string {
  // OUT-20260511-0001 → 0001
  return outbound_id.split("-").slice(-1)[0] || outbound_id;
}

async function appendOutboundScan(
  db: any,
  params: {
    outbound_id: string;
    type:
      | "inbound_picked"
      | "outbound_pick_complete"
      | "box_created"
      | "outbound_pack_complete"
      | "box_weight_verified"
      | "box_weight_override"
      | "outbound_weight_verified"
      | "label_obtained"
      | "label_failed"
      | "box_departed"
      | "outbound_departed";
    inbound_id?: string | null;
    box_id?: string | null;
    operator_staff_id: string;
    pick_method?: "pda_scan" | "desktop_batch";
    weigh_method?: "pda" | "desktop";
    details?: Record<string, unknown>;
    staff_note?: string;
  },
  session?: any
) {
  // Compact scan id: OS{date}-{outbound_short}-{random} — daily counter
  // would also work; this avoids one extra round-trip per scan.
  const ts = new Date();
  const datePart = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(
    ts.getDate()
  ).padStart(2, "0")}`;
  const _id = `OS${datePart}-${shortOutboundId(params.outbound_id)}-${ts.getTime()
    .toString(36)
    .toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await db.collection(collections.OUTBOUND_SCAN).insertOne(
    {
      _id: _id as any,
      outbound_id: params.outbound_id,
      inbound_id: params.inbound_id ?? null,
      box_id: params.box_id ?? null,
      type: params.type,
      operator_staff_id: params.operator_staff_id,
      pick_method: params.pick_method ?? null,
      weigh_method: params.weigh_method ?? null,
      details: params.details ?? null,
      staff_note: params.staff_note ?? null,
      createdAt: ts,
    } as any,
    session ? { session } : {}
  );
  return _id;
}

async function appendActionLog(
  db: any,
  params: {
    outbound_id: string;
    client_id: string;
    action:
      | "picking_progress"
      | "picked"
      | "packing_progress"
      | "packed"
      | "weighing_progress"
      | "weight_verified"
      | "label_obtained"
      | "label_failed"
      | "label_printed"
      | "departed";
    from_status: OutboundStatusV1 | null;
    to_status: OutboundStatusV1 | null;
    actor_type: "wms_staff" | "system" | "admin" | "client";
    actor_id: string | null;
    detail?: Record<string, unknown>;
  },
  session?: any
) {
  // Re-use the P7 action log collection; "action" enum is informational
  // only (audit is the structured log).
  await db.collection(collections.OUTBOUND_ACTION_LOG).insertOne(
    {
      outbound_id: params.outbound_id,
      client_id: params.client_id,
      action: params.action,
      from_status: params.from_status,
      to_status: params.to_status,
      actor_type: params.actor_type,
      actor_id: params.actor_id,
      detail: params.detail ?? null,
      createdAt: new Date(),
    } as any,
    session ? { session } : {}
  );
}

/**
 * Lazy-sync pack_boxes_v1 → outbound_boxes for the given outbound_ids.
 *
 * Background: P11/P12 (item-driven pack + 秤重置板) only writes
 * `pack_boxes_v1`. Legacy label-fetch + depart code paths read
 * `outbound_boxes` (P8 schema). This helper creates the missing
 * outbound_boxes rows from pack_boxes data so label-fetch works on v1
 * outbounds without breaking the depart / shipped / invoice readers.
 *
 * Idempotent: re-running for an already-synced outbound is a no-op.
 * One-pack-box-per-outbound assumption holds in current v1 (Phase B
 * cross-outbound consolidation is not yet enabled), so the box_no →
 * (outbound_id, box_no) mapping is unambiguous.
 */
async function ensureOutboundBoxesForOutbounds(
  db: any,
  outbound_ids: string[]
) {
  if (outbound_ids.length === 0) return;
  const packBoxes = await db
    .collection(collections.PACK_BOX_V1)
    .find({ "items.outbound_id": { $in: outbound_ids }, status: "sealed" })
    .toArray();
  const now = new Date();
  for (const pb of packBoxes as any[]) {
    const obIdsInThisBox = Array.from(
      new Set(
        (pb.items ?? [])
          .map((it: any) => it.outbound_id)
          .filter((id: string) => outbound_ids.includes(id))
      )
    );
    for (const oid of obIdsInThisBox as string[]) {
      const existing = await db
        .collection(collections.OUTBOUND_BOX)
        .findOne({ outbound_id: oid, box_no: pb.box_no });
      if (existing) continue;
      await db.collection(collections.OUTBOUND_BOX).insertOne({
        _id: `${oid}-${pb.box_no}` as any,
        outbound_id: oid,
        box_no: pb.box_no,
        dimensions: {
          length: Math.max(1, Math.round(pb.length || 1)),
          width: Math.max(1, Math.round(pb.width || 1)),
          height: Math.max(1, Math.round(pb.height || 1)),
        },
        weight_estimate: pb.weight || 0.1,
        weight_actual: pb.weight || 0.1,
        tare_weight: 1,
        weight_diff: 0,
        weight_diff_passed: true,
        status: "weight_verified",
        label_pdf_path: null,
        tracking_no_carrier: null,
        actual_label_fee: null,
        label_obtained_at: null,
        label_obtained_by_operator_type: null,
        departed_at: null,
        pallet_label_id: pb.pallet_label_id ?? null,
        created_by_staff_id: pb.sealed_by ?? pb.opened_by ?? "system",
        createdAt: now,
        updatedAt: now,
      } as any);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Stage 5 — Pick
// ─────────────────────────────────────────────────────────────

export interface PickInboundInput {
  outbound_id: string;
  inbound_id: string;
  locationCode?: string; // PDA path supplies this; desktop omits.
  method: "pda_scan" | "desktop_batch";
}

export async function pickInbound(
  ctx: StaffContext,
  input: PickInboundInput
) {
  const db = await connectToDatabase();
  const ob = await getOutbound(db, input.outbound_id);
  if (!["ready_for_label", "picking"].includes(ob.status)) {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_PICK", { status: ob.status });
  }

  // Inbound must be linked to this outbound and currently status=received.
  const link = await db.collection(collections.OUTBOUND_INBOUND_LINK).findOne({
    outbound_id: input.outbound_id,
    inbound_id: input.inbound_id,
    unlinked_at: null,
  });
  if (!link) {
    throw new ApiError("INBOUND_NOT_IN_OUTBOUND", {
      inboundId: input.inbound_id,
      outboundId: input.outbound_id,
    });
  }
  const inb = await db
    .collection(collections.INBOUND)
    .findOne({ _id: input.inbound_id as any });
  if (!inb) {
    throw new ApiError("INBOUND_NOT_RECEIVED", { inboundIds: input.inbound_id });
  }
  if (inb.status !== "received") {
    throw new ApiError("INBOUND_ALREADY_PICKED", {
      inboundIds: input.inbound_id,
    });
  }

  // P10 — if outbound is assigned to a batch, that batch must be picking.
  // (Outbounds without batch_id remain picking-anywhere — back-compat for
  // legacy and ad-hoc desktop flow that bypasses the batch builder.)
  if (ob.batch_id) {
    const batch = await db
      .collection(collections.PICK_BATCH)
      .findOne({ _id: ob.batch_id as any });
    if (!batch || batch.status !== "picking") {
      throw new ApiError("OUTBOUND_NOT_IN_ACTIVE_BATCH", {
        outboundId: input.outbound_id,
      });
    }
  }

  // PDA path: optionally verify locationCode. Skip if not provided (desktop).
  if (input.locationCode) {
    const itemLoc = await db
      .collection(collections.ITEM_LOCATION)
      .findOne({ itemCode: input.inbound_id });
    if (
      itemLoc &&
      itemLoc.locationCode &&
      itemLoc.locationCode !== input.locationCode
    ) {
      throw new ApiError("LOCATION_MISMATCH", {
        scanned: input.locationCode,
        expected: itemLoc.locationCode,
      });
    }
  }

  const now = new Date();
  const session = getMongoClient().startSession();
  let outbound_picked = false;
  try {
    await session.withTransaction(async () => {
      // 1) Mark item_location as picked WITHOUT changing locationCode (Bug 6 fix)
      await db.collection(collections.ITEM_LOCATION).updateOne(
        { itemCode: input.inbound_id },
        {
          $set: {
            currentStatus: "picked",
            lastMovedAt: now,
            updatedAt: now,
          },
        },
        { session, upsert: false }
      );
      // 2) inbound master: received → picking (atomic via filter)
      await db.collection(collections.INBOUND).updateOne(
        { _id: input.inbound_id as any, status: "received" },
        { $set: { status: "picking", updatedAt: now } },
        { session }
      );
      // 3) outbound master: ready_for_label → picking (idempotent for subsequent inbound picks)
      await db.collection(collections.OUTBOUND).updateOne(
        { _id: input.outbound_id as any, status: "ready_for_label" },
        { $set: { status: "picking", updatedAt: now } },
        { session }
      );
      // 4) outbound_scan: inbound_picked
      await appendOutboundScan(
        db,
        {
          outbound_id: input.outbound_id,
          inbound_id: input.inbound_id,
          type: "inbound_picked",
          operator_staff_id: ctx.staff_id,
          pick_method: input.method,
          details: { locationCode: input.locationCode ?? null },
        },
        session
      );
    });
  } finally {
    await session.endSession();
  }

  // 5) Check whether all inbounds in this outbound are now picked. If so,
  //    transition status → picked + write outbound_pick_complete scan.
  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({ outbound_id: input.outbound_id, unlinked_at: null })
    .toArray();
  const inboundIds = links.map((l: any) => l.inbound_id);
  const stillReceived = await db
    .collection(collections.INBOUND)
    .countDocuments({
      _id: { $in: inboundIds as any },
      status: "received",
    });
  if (stillReceived === 0 && inboundIds.length > 0) {
    const upd = await db.collection(collections.OUTBOUND).updateOne(
      { _id: input.outbound_id as any, status: "picking" },
      { $set: { status: "picked", updatedAt: new Date() } }
    );
    if (upd.modifiedCount > 0) {
      outbound_picked = true;
      await appendOutboundScan(db, {
        outbound_id: input.outbound_id,
        type: "outbound_pick_complete",
        operator_staff_id: ctx.staff_id,
      });
      await appendActionLog(db, {
        outbound_id: input.outbound_id,
        client_id: ob.client_id,
        action: "picked",
        from_status: "picking",
        to_status: "picked",
        actor_type: "wms_staff",
        actor_id: ctx.staff_id,
      });
      await logAudit({
        action: AUDIT_ACTIONS.outbound_picked,
        actor_type: AUDIT_ACTOR_TYPES.wms_staff,
        actor_id: ctx.staff_id,
        target_type: AUDIT_TARGET_TYPES.outbound,
        target_id: input.outbound_id,
        details: { method: input.method },
        warehouse_code: ctx.warehouseCode,
      });
      // P10 — if outbound belongs to a batch, check whether the batch is
      // now fully picked and auto-advance.
      try {
        await pickBatchService.checkBatchPickComplete(input.outbound_id);
      } catch (err) {
        // Non-fatal: pick succeeded, batch roll-up failure can be reconciled.
        console.error("pick_batch advance failed:", err);
      }
    }
  } else {
    await appendActionLog(db, {
      outbound_id: input.outbound_id,
      client_id: ob.client_id,
      action: "picking_progress",
      from_status: ob.status,
      to_status: "picking",
      actor_type: "wms_staff",
      actor_id: ctx.staff_id,
      detail: { inbound_id: input.inbound_id, method: input.method },
    });
  }

  const after = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: input.outbound_id as any });
  return { outbound: projectOutboundV1(after), outbound_picked };
}

// ── pick by tracking_no (PDA/desktop barcode scan-loop) ─────
//
// Picker doesn't think in outbounds — they see "what's on this shelf"
// and scan the tracking barcode. This helper resolves tracking → inbound
// → outbound link, validates the shelf if supplied, and dispatches to
// pickInbound. Used by both PDA `wms/pda/scan/shelf` and desktop
// `wms/operations/pick` after the picker-vs-packer split.

export async function pickByTracking(
  ctx: StaffContext,
  params: {
    tracking_no: string;
    locationCode?: string;
    batch_id?: string;
  }
): Promise<{ outbound_id: string; inbound_id: string; outbound_picked: boolean }> {
  const db = await connectToDatabase();
  const { normalizeTrackingNo } = await import("@/types/InboundV1");
  const normalized = normalizeTrackingNo(params.tracking_no);
  // 1) inbound match. Scope to warehouse to avoid cross-warehouse collisions.
  const inb = await db.collection(collections.INBOUND).findOne({
    tracking_no_normalized: normalized,
    warehouseCode: ctx.warehouseCode,
  });
  if (!inb) throw new ApiError("INBOUND_NOT_FOUND");

  // 2) find the active (unlinked_at:null) outbound link
  const link = await db.collection(collections.OUTBOUND_INBOUND_LINK).findOne({
    inbound_id: String(inb._id),
    unlinked_at: null,
  });
  if (!link) {
    throw new ApiError("INBOUND_NOT_IN_OUTBOUND", {
      inboundId: String(inb._id),
      outboundId: "(none)",
    });
  }

  // 3) optional batch scope check
  if (params.batch_id) {
    const ob = await getOutbound(db, link.outbound_id);
    if (ob.batch_id !== params.batch_id) {
      throw new ApiError("OUTBOUND_NOT_IN_ACTIVE_BATCH", {
        outboundId: link.outbound_id,
      });
    }
  }

  // 4) dispatch to pickInbound — it handles shelf-location guard,
  //    status checks, transactional flips and audit / action log.
  const result = await pickInbound(ctx, {
    outbound_id: link.outbound_id,
    inbound_id: String(inb._id),
    locationCode: params.locationCode,
    method: "pda_scan",
  });
  return {
    outbound_id: link.outbound_id,
    inbound_id: String(inb._id),
    outbound_picked: result.outbound_picked,
  };
}

export async function listPickableOutbounds(warehouseCode?: string) {
  const db = await connectToDatabase();
  const filter: any = {
    status: { $in: ["ready_for_label", "picking"] },
  };
  if (warehouseCode) filter.warehouseCode = warehouseCode;
  const docs = await db
    .collection(collections.OUTBOUND)
    .find(filter)
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray();
  return docs.map(projectOutboundV1);
}

export async function getPickDetail(outbound_id: string) {
  const db = await connectToDatabase();
  const ob = await getOutbound(db, outbound_id);
  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({ outbound_id, unlinked_at: null })
    .toArray();
  const inboundIds = links.map((l: any) => l.inbound_id);
  const inbounds = await db
    .collection(collections.INBOUND)
    .find({ _id: { $in: inboundIds as any } })
    .toArray();
  const itemLocations = await db
    .collection(collections.ITEM_LOCATION)
    .find({ itemCode: { $in: inboundIds } })
    .toArray();
  const locMap = new Map(
    itemLocations.map((l: any) => [l.itemCode, l.locationCode ?? null])
  );
  return {
    outbound: projectOutboundV1(ob),
    inbounds: inbounds.map((i: any) => ({
      _id: String(i._id),
      tracking_no: i.tracking_no,
      status: i.status,
      actualWeight: i.actualWeight ?? null,
      locationCode: locMap.get(String(i._id)) ?? null,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// Stage 6 — Pack
// ─────────────────────────────────────────────────────────────

export interface CreateBoxInput {
  outbound_id: string;
  inbound_ids: string[];
  dimensions: { length: number; width: number; height: number };
  weight_estimate: number;
}

export async function createBox(ctx: StaffContext, input: CreateBoxInput) {
  if (input.inbound_ids.length === 0) {
    throw new ApiError("EMPTY_BOX_INBOUND_LIST");
  }
  const db = await connectToDatabase();
  const ob = await getOutbound(db, input.outbound_id);
  if (!["picked", "packing"].includes(ob.status)) {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_PACK", { status: ob.status });
  }
  // All inbounds must (a) belong to this outbound, (b) be currently picking
  // (i.e. picked but not boxed), (c) have no active box link.
  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({
      outbound_id: input.outbound_id,
      inbound_id: { $in: input.inbound_ids },
      unlinked_at: null,
    })
    .toArray();
  if (links.length !== input.inbound_ids.length) {
    throw new ApiError("INBOUND_NOT_IN_OUTBOUND", {
      inboundId: input.inbound_ids.join(","),
      outboundId: input.outbound_id,
    });
  }
  const inbounds = await db
    .collection(collections.INBOUND)
    .find({ _id: { $in: input.inbound_ids as any }, status: "picking" })
    .toArray();
  if (inbounds.length !== input.inbound_ids.length) {
    throw new ApiError("INBOUND_NOT_PICKED", {
      inboundIds: input.inbound_ids.join(","),
    });
  }
  const existingBoxLinks = await db
    .collection(collections.BOX_INBOUND_LINK)
    .find({ inbound_id: { $in: input.inbound_ids }, unlinked_at: null })
    .toArray();
  if (existingBoxLinks.length > 0) {
    throw new ApiError("INBOUND_ALREADY_BOXED", {
      inboundIds: existingBoxLinks.map((l: any) => l.inbound_id).join(","),
    });
  }

  // Compute box_no = B-{outbound_short}-{seq:NN}
  const existingBoxes = await db
    .collection(collections.OUTBOUND_BOX)
    .countDocuments({ outbound_id: input.outbound_id });
  const seq = existingBoxes + 1;
  const box_no = `B-${shortOutboundId(input.outbound_id)}-${String(seq).padStart(2, "0")}`;
  const box_id = new ObjectId().toString();

  const now = new Date();
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.OUTBOUND_BOX).insertOne(
        {
          _id: box_id as any,
          outbound_id: input.outbound_id,
          box_no,
          dimensions: input.dimensions,
          weight_estimate: input.weight_estimate,
          weight_actual: null,
          tare_weight: null,
          weight_diff: null,
          weight_diff_passed: null,
          status: "packing",
          label_pdf_path: null,
          tracking_no_carrier: null,
          actual_label_fee: null,
          label_obtained_at: null,
          label_obtained_by_operator_type: null,
          departed_at: null,
          created_by_staff_id: ctx.staff_id,
          createdAt: now,
          updatedAt: now,
        } as any,
        { session }
      );
      const linkDocs = input.inbound_ids.map((iid) => ({
        box_id,
        outbound_id: input.outbound_id,
        inbound_id: iid,
        linked_at: now,
        unlinked_at: null,
      }));
      await db
        .collection(collections.BOX_INBOUND_LINK)
        .insertMany(linkDocs as any, { session });
      // inbound master: picking → packed
      await db.collection(collections.INBOUND).updateMany(
        { _id: { $in: input.inbound_ids as any }, status: "picking" },
        { $set: { status: "packed", updatedAt: now } },
        { session }
      );
      // outbound master: picked → packing (first box) or stays packing
      await db.collection(collections.OUTBOUND).updateOne(
        { _id: input.outbound_id as any, status: "picked" },
        { $set: { status: "packing", updatedAt: now } },
        { session }
      );
      await appendOutboundScan(
        db,
        {
          outbound_id: input.outbound_id,
          box_id,
          type: "box_created",
          operator_staff_id: ctx.staff_id,
          details: {
            box_no,
            dimensions: input.dimensions,
            weight_estimate: input.weight_estimate,
            inbound_ids: input.inbound_ids,
          },
        },
        session
      );
    });
  } finally {
    await session.endSession();
  }

  await appendActionLog(db, {
    outbound_id: input.outbound_id,
    client_id: ob.client_id,
    action: "packing_progress",
    from_status: ob.status,
    to_status: "packing",
    actor_type: "wms_staff",
    actor_id: ctx.staff_id,
    detail: { box_no, inbound_ids: input.inbound_ids },
  });
  await logAudit({
    action: AUDIT_ACTIONS.outbound_box_created,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.outbound_box,
    target_id: box_id,
    details: { box_no, outbound_id: input.outbound_id, inbound_count: input.inbound_ids.length },
    warehouse_code: ctx.warehouseCode,
  });
  return { box_id, box_no };
}

export async function completePacking(ctx: StaffContext, outbound_id: string) {
  const db = await connectToDatabase();
  const ob = await getOutbound(db, outbound_id);
  if (!["packing", "packed"].includes(ob.status)) {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_PACK", { status: ob.status });
  }
  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({ outbound_id, unlinked_at: null })
    .toArray();
  const boxed = await db
    .collection(collections.BOX_INBOUND_LINK)
    .countDocuments({
      outbound_id,
      inbound_id: { $in: links.map((l: any) => l.inbound_id) },
      unlinked_at: null,
    });
  if (boxed !== links.length) {
    throw new ApiError("NOT_ALL_INBOUNDS_BOXED");
  }
  const now = new Date();
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.OUTBOUND).updateOne(
        { _id: outbound_id as any, status: "packing" },
        { $set: { status: "packed", updatedAt: now } },
        { session }
      );
      await db
        .collection(collections.OUTBOUND_BOX)
        .updateMany(
          { outbound_id, status: "packing" },
          { $set: { status: "packed", updatedAt: now } },
          { session }
        );
      await appendOutboundScan(
        db,
        {
          outbound_id,
          type: "outbound_pack_complete",
          operator_staff_id: ctx.staff_id,
        },
        session
      );
    });
  } finally {
    await session.endSession();
  }
  await appendActionLog(db, {
    outbound_id,
    client_id: ob.client_id,
    action: "packed",
    from_status: "packing",
    to_status: "packed",
    actor_type: "wms_staff",
    actor_id: ctx.staff_id,
  });
  await logAudit({
    action: AUDIT_ACTIONS.outbound_packed,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.outbound,
    target_id: outbound_id,
    details: {},
    warehouse_code: ctx.warehouseCode,
  });
  const after = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  return projectOutboundV1(after);
}

export async function listPackableOutbounds(warehouseCode?: string) {
  const db = await connectToDatabase();
  const filter: any = { status: { $in: ["picked", "packing"] } };
  if (warehouseCode) filter.warehouseCode = warehouseCode;
  const docs = await db
    .collection(collections.OUTBOUND)
    .find(filter)
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray();
  return docs.map(projectOutboundV1);
}

export async function listBoxes(outbound_id: string): Promise<OutboundBoxPublic[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id })
    .sort({ box_no: 1 })
    .toArray();
  return docs.map(projectOutboundBox);
}

// ─────────────────────────────────────────────────────────────
// Stage 7 — Weigh
// ─────────────────────────────────────────────────────────────

export interface WeighBoxInput {
  box_no: string;
  actual_gross_weight: number;
  tare_weight: number;
  method: "pda" | "desktop";
  override?: boolean; // true to acknowledge over-tolerance and proceed
}

export async function weighBox(ctx: StaffContext, input: WeighBoxInput) {
  const db = await connectToDatabase();
  const box = await db
    .collection(collections.OUTBOUND_BOX)
    .findOne({ box_no: input.box_no });
  if (!box) throw new ApiError("BOX_NOT_FOUND", { boxNo: input.box_no });
  if (!["packed", "weight_verified"].includes(box.status)) {
    throw new ApiError("BOX_NOT_AVAILABLE_FOR_WEIGH", { status: box.status });
  }
  const ob = await getOutbound(db, box.outbound_id);
  if (!["packed", "weighing", "weight_verified"].includes(ob.status)) {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_WEIGH", { status: ob.status });
  }

  // Sum the linked inbounds' actualWeight to compute expected gross.
  const boxLinks = await db
    .collection(collections.BOX_INBOUND_LINK)
    .find({ box_id: box._id, unlinked_at: null })
    .toArray();
  const inboundIds = boxLinks.map((l: any) => l.inbound_id);
  const inbounds = await db
    .collection(collections.INBOUND)
    .find({ _id: { $in: inboundIds as any } })
    .toArray();
  const inboundWeightSum = inbounds.reduce(
    (s: number, ib: any) => s + (ib.actualWeight ?? 0),
    0
  );
  const expected_gross_weight = inboundWeightSum + input.tare_weight;
  const weight_diff = input.actual_gross_weight - expected_gross_weight;
  const tolerance_passed = Math.abs(weight_diff) < WEIGHT_TOLERANCE_KG;
  if (!tolerance_passed && !input.override) {
    throw new ApiError("WEIGHT_TOLERANCE_EXCEEDED_NO_OVERRIDE", {
      diff: String(Math.abs(weight_diff).toFixed(2)),
      tol: String(WEIGHT_TOLERANCE_KG),
    });
  }

  const now = new Date();
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      // Replaceable per-box weight record (upsert).
      await db.collection(collections.OUTBOUND_BOX_WEIGHT).updateOne(
        { box_id: box._id },
        {
          $set: {
            outbound_id: box.outbound_id,
            expected_gross_weight,
            actual_gross_weight: input.actual_gross_weight,
            tare_weight_input: input.tare_weight,
            weight_diff,
            tolerance_threshold: WEIGHT_TOLERANCE_KG,
            tolerance_passed,
            override_at: !tolerance_passed ? now : null,
            weighed_by_staff_id: ctx.staff_id,
            weighed_at: now,
            weigh_method: input.method,
          },
          $setOnInsert: { box_id: box._id },
        },
        { session, upsert: true }
      );
      await db.collection(collections.OUTBOUND_BOX).updateOne(
        { _id: box._id },
        {
          $set: {
            weight_actual: input.actual_gross_weight,
            tare_weight: input.tare_weight,
            weight_diff,
            weight_diff_passed: tolerance_passed,
            status: "weight_verified",
            updatedAt: now,
          },
        },
        { session }
      );
      // outbound master: packed → weighing (first weigh) or stay weighing
      await db.collection(collections.OUTBOUND).updateOne(
        { _id: box.outbound_id as any, status: "packed" },
        { $set: { status: "weighing", updatedAt: now } },
        { session }
      );
      await appendOutboundScan(
        db,
        {
          outbound_id: box.outbound_id,
          box_id: String(box._id),
          type: tolerance_passed ? "box_weight_verified" : "box_weight_override",
          operator_staff_id: ctx.staff_id,
          weigh_method: input.method,
          details: {
            box_no: input.box_no,
            actual: input.actual_gross_weight,
            tare: input.tare_weight,
            expected: expected_gross_weight,
            diff: weight_diff,
          },
        },
        session
      );
    });
  } finally {
    await session.endSession();
  }

  await appendActionLog(db, {
    outbound_id: box.outbound_id,
    client_id: ob.client_id,
    action: "weighing_progress",
    from_status: ob.status,
    to_status: "weighing",
    actor_type: "wms_staff",
    actor_id: ctx.staff_id,
    detail: {
      box_no: input.box_no,
      actual: input.actual_gross_weight,
      diff: weight_diff,
      override: !tolerance_passed,
    },
  });
  if (!tolerance_passed) {
    await logAudit({
      action: AUDIT_ACTIONS.outbound_box_weight_override,
      actor_type: AUDIT_ACTOR_TYPES.wms_staff,
      actor_id: ctx.staff_id,
      target_type: AUDIT_TARGET_TYPES.outbound_box,
      target_id: String(box._id),
      details: { diff: weight_diff, actual: input.actual_gross_weight },
      warehouse_code: ctx.warehouseCode,
    });
  }
  const after = await db
    .collection(collections.OUTBOUND_BOX)
    .findOne({ _id: box._id });
  return { box: projectOutboundBox(after), tolerance_passed, weight_diff };
}

export interface CompleteWeighingResult {
  outbound: ReturnType<typeof projectOutboundV1>;
  rate_quote_recomputed: boolean;
  auto_label_triggered: boolean;
}

export async function completeWeighing(
  ctx: StaffContext,
  outbound_id: string
): Promise<CompleteWeighingResult> {
  const db = await connectToDatabase();
  const ob = await getOutbound(db, outbound_id);
  if (!["weighing", "packed"].includes(ob.status)) {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_WEIGH", { status: ob.status });
  }
  // Box count clamp.
  const boxes = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id })
    .toArray();
  const weights = await db
    .collection(collections.OUTBOUND_BOX_WEIGHT)
    .find({ outbound_id })
    .toArray();
  if (weights.length !== boxes.length) {
    throw new ApiError("BOX_COUNT_MISMATCH", {
      weighed: String(weights.length),
      registered: String(boxes.length),
    });
  }

  // Recompute rate quote on actual total weight.
  const total_weight_actual = weights.reduce(
    (s: number, w: any) => s + w.actual_gross_weight,
    0
  );
  let rate_quote_recomputed = false;
  let rate_quote_pre_label: any = null;
  try {
    rate_quote_pre_label = await rateQuoteWithLog({
      outbound_id,
      client_id: ob.client_id,
      carrier_code: ob.carrier_code,
      destination_country: ob.destination_country,
      weight_kg: total_weight_actual,
    });
    rate_quote_recomputed = true;
  } catch (err: any) {
    // Capacity violation here is informational only at weight-verify time;
    // label-fetch will re-check and hold if it still fails.
    rate_quote_pre_label = {
      error: err?.name ?? "UNKNOWN",
      message: err?.message,
    };
  }

  const now = new Date();
  const total_dimension_summary = aggregateDimensions(boxes);
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.OUTBOUND).updateOne(
        { _id: outbound_id as any, status: "weighing" },
        {
          $set: {
            status: "weight_verified",
            total_weight_actual,
            total_dimension_actual: total_dimension_summary,
            rate_quote_pre_label,
            rate_quote_pre_label_at: now,
            actual_weight_kg: total_weight_actual,
            // Refresh quoted amount with the more accurate quote so the
            // wallet-gate check at fetchLabel time uses real numbers.
            ...(rate_quote_recomputed && rate_quote_pre_label?.total
              ? {
                  rate_quote: rate_quote_pre_label,
                  quoted_amount_hkd: rate_quote_pre_label.total,
                }
              : {}),
            updatedAt: now,
          },
        },
        { session }
      );
      await appendOutboundScan(
        db,
        {
          outbound_id,
          type: "outbound_weight_verified",
          operator_staff_id: ctx.staff_id,
          details: {
            total_weight_actual,
            box_count: boxes.length,
          },
        },
        session
      );
    });
  } finally {
    await session.endSession();
  }

  await appendActionLog(db, {
    outbound_id,
    client_id: ob.client_id,
    action: "weight_verified",
    from_status: "weighing",
    to_status: "weight_verified",
    actor_type: "wms_staff",
    actor_id: ctx.staff_id,
    detail: {
      box_count: boxes.length,
      total_weight_actual,
      recomputed_quote: rate_quote_pre_label,
    },
  });
  await logAudit({
    action: AUDIT_ACTIONS.outbound_weight_verified,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.outbound,
    target_id: outbound_id,
    details: { total_weight_actual, box_count: boxes.length },
    warehouse_code: ctx.warehouseCode,
  });

  // P10 — mint a pallet label so the boxes can be parked physically while
  // we wait for either auto-label or client confirmation. Best-effort: a
  // pallet failure must not roll back the weight verification.
  try {
    await palletLabelService.printPallet(
      { staff_id: ctx.staff_id, warehouseCode: ctx.warehouseCode },
      outbound_id,
      "system"
    );
  } catch (err) {
    console.error("pallet label mint failed:", err);
  }

  // Branch: auto → trigger label immediately. confirm_before_label →
  // status=pending_client_label + notification.
  let auto_label_triggered = false;
  if (ob.processing_preference === "auto") {
    try {
      await fetchLabelMultiBox(outbound_id, "system", null);
      auto_label_triggered = true;
    } catch (err) {
      // fetchLabelMultiBox already moved status to held(label_failed_retry).
      // Per spec, downgrade to pending_client_label so client can retry.
      await db.collection(collections.OUTBOUND).updateOne(
        { _id: outbound_id as any, status: "held" },
        {
          $set: {
            status: "pending_client_label",
            updatedAt: new Date(),
          },
        }
      );
      await createNotification({
        client_id: ob.client_id,
        type: "outbound_pending_client_label",
        title: "出庫單需您手動確認",
        body: `自動取運單失敗，請手動確認：${String((err as any)?.message ?? err)}`,
        reference_type: "outbound",
        reference_id: outbound_id,
        action_url: `/zh-hk/outbound/${outbound_id}/confirm-label`,
      });
    }
  } else {
    await db.collection(collections.OUTBOUND).updateOne(
      { _id: outbound_id as any, status: "weight_verified" },
      {
        $set: {
          status: "pending_client_label",
          updatedAt: new Date(),
        },
      }
    );
    await createNotification({
      client_id: ob.client_id,
      type: "outbound_pending_client_label",
      title: "出庫單複重完成，請確認運單",
      body: `出庫單 ${outbound_id} 共 ${boxes.length} 箱、實重 ${total_weight_actual.toFixed(
        2
      )}kg，請於 OMS 確認取運單。`,
      reference_type: "outbound",
      reference_id: outbound_id,
      action_url: `/zh-hk/outbound/${outbound_id}/confirm-label`,
    });
  }

  const after = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  return {
    outbound: projectOutboundV1(after),
    rate_quote_recomputed,
    auto_label_triggered,
  };
}

function aggregateDimensions(boxes: any[]) {
  if (boxes.length === 0) return null;
  let max_length = 0;
  let max_width = 0;
  let max_height = 0;
  let sum_volume = 0;
  for (const b of boxes) {
    const d = b.dimensions ?? {};
    max_length = Math.max(max_length, d.length ?? 0);
    max_width = Math.max(max_width, d.width ?? 0);
    max_height = Math.max(max_height, d.height ?? 0);
    sum_volume += (d.length ?? 0) * (d.width ?? 0) * (d.height ?? 0);
  }
  return {
    box_count: boxes.length,
    max_length,
    max_width,
    max_height,
    sum_volume_cm3: sum_volume,
  };
}

// ─────────────────────────────────────────────────────────────
// Stage 7 step 3 — Label (multi-box) + Step 4 — Print
// ─────────────────────────────────────────────────────────────

/**
 * Multi-box label fetch. Replaces P7's single-box fetchLabel for outbounds
 * that have gone through pack + weigh.
 *
 * Per-box: calls carrier adapter → writes per-box label_pdf_path +
 *  tracking_no_carrier + actual_label_fee → updates box.status=label_obtained.
 *
 * Outbound master gets aggregate actual_label_fee + label_obtained_at +
 *  status=label_obtained. The wallet charge happens once for the total.
 *
 * On any failure mid-way: rollback to held(label_failed_retry); already-
 *  obtained box labels are not rolled back (carrier-side already wrote
 *  trackings; cancellation would require cancelLabel calls — handled by
 *  admin retry/cancel path).
 */
export async function fetchLabelMultiBox(
  outbound_id: string,
  operator_type: "system" | "client" | "admin",
  operator_id: string | null
) {
  const db = await connectToDatabase();
  const ob = await getOutbound(db, outbound_id);
  if (!["weight_verified", "pending_client_label"].includes(ob.status)) {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", { status: ob.status });
  }
  // P11/P12 outbounds only have pack_boxes_v1; lazy-sync to outbound_boxes
  // before reading. No-op for legacy P8 outbounds that already have them.
  await ensureOutboundBoxesForOutbounds(db, [outbound_id]);
  const boxes = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id })
    .sort({ box_no: 1 })
    .toArray();
  if (boxes.length === 0) {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", { status: ob.status });
  }

  // Outbound shipping fee is billed by the carrier directly against the
  // client's own carrier account (Fuuffy / YunExpress OAuth) — ShipItAsia
  // never touches the wallet for shipping. No pre-flight balance gate.

  // Claim status=label_obtaining (atomic, prevents concurrent fetch).
  const claim = await db.collection(collections.OUTBOUND).findOneAndUpdate(
    {
      _id: outbound_id as any,
      status: { $in: ["weight_verified", "pending_client_label"] },
    },
    { $set: { status: "label_obtaining", updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  const claimed: any =
    claim && (claim as any).value !== undefined ? (claim as any).value : claim;
  if (!claimed) {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", { status: ob.status });
  }

  // Sender address — v1 uses the outbound's warehouse master.
  const warehouse = await db
    .collection(collections.WAREHOUSE)
    .findOne({ warehouseCode: ob.warehouseCode });

  const labelResults: Array<{
    box_id: string;
    box_no: string;
    label_pdf_path: string;
    tracking_no: string;
    charged: number;
  }> = [];

  try {
    const adapter = await getCarrierAdapter(ob.carrier_code);
    for (const box of boxes) {
      const result = await adapter.getLabel({
        outbound_id,
        destination_country: ob.destination_country,
        weight_kg: box.weight_actual ?? box.weight_estimate,
        receiver_name: ob.receiver_address?.name ?? "",
        receiver_address: [
          ob.receiver_address?.address,
          ob.receiver_address?.city,
          ob.receiver_address?.country_code,
        ]
          .filter(Boolean)
          .join(", "),
        box_id: String(box._id),
        box_no: box.box_no,
        dimensions: box.dimensions,
        sender_name: warehouse?.name_zh ?? warehouse?.name_en ?? ob.warehouseCode,
        sender_address: warehouse?.address_zh ?? warehouse?.address_en ?? "",
      });
      await db.collection(collections.OUTBOUND_BOX).updateOne(
        { _id: box._id },
        {
          $set: {
            label_pdf_path: result.label_url,
            tracking_no_carrier: result.tracking_no,
            actual_label_fee: result.charged_amount,
            label_obtained_at: new Date(),
            label_obtained_by_operator_type: operator_type,
            status: "label_obtained",
            updatedAt: new Date(),
          },
        }
      );
      await appendOutboundScan(db, {
        outbound_id,
        box_id: String(box._id),
        type: "label_obtained",
        operator_staff_id: operator_id ?? operator_type.toUpperCase(),
        details: {
          tracking_no: result.tracking_no,
          fee: result.charged_amount,
          box_no: box.box_no,
        },
      });
      labelResults.push({
        box_id: String(box._id),
        box_no: box.box_no,
        label_pdf_path: result.label_url,
        tracking_no: result.tracking_no,
        charged: result.charged_amount,
      });
    }

    const total_actual_label_fee = labelResults.reduce(
      (s, r) => s + r.charged,
      0
    );

    // Shipping cost is settled by the carrier against the client's own
    // carrier account — recorded on the outbound for reference but no
    // wallet movement on our side.

    const firstLabel = labelResults[0];
    const now = new Date();
    await db.collection(collections.OUTBOUND).updateOne(
      { _id: outbound_id as any },
      {
        $set: {
          status: "label_obtained",
          label_url: firstLabel?.label_pdf_path ?? null, // back-compat with P7 detail UI
          tracking_no: firstLabel?.tracking_no ?? null,
          actual_label_fee: total_actual_label_fee,
          label_obtained_at: now,
          label_obtained_by_operator_type: operator_type,
          label_obtained_by_operator_id: operator_id,
          held_reason: null,
          held_since: null,
          held_detail: null,
          updatedAt: now,
        },
      }
    );
    await appendActionLog(db, {
      outbound_id,
      client_id: ob.client_id,
      action: "label_obtained",
      from_status: "label_obtaining",
      to_status: "label_obtained",
      actor_type: operator_type === "system" ? "system" : operator_type,
      actor_id: operator_id,
      detail: {
        box_count: boxes.length,
        total_label_fee: total_actual_label_fee,
        tracking_numbers: labelResults.map((r) => r.tracking_no),
      },
    });
    await logAudit({
      action: AUDIT_ACTIONS.outbound_label_obtained,
      actor_type:
        operator_type === "system"
          ? AUDIT_ACTOR_TYPES.system
          : operator_type === "client"
            ? AUDIT_ACTOR_TYPES.client
            : AUDIT_ACTOR_TYPES.admin,
      actor_id: operator_id,
      target_type: AUDIT_TARGET_TYPES.outbound,
      target_id: outbound_id,
      details: {
        box_count: boxes.length,
        total: total_actual_label_fee,
        carrier_code: ob.carrier_code,
      },
    });
    await createNotification({
      client_id: ob.client_id,
      type: "outbound_label_obtained",
      title: "出庫面單已取得",
      body: `出庫單 ${outbound_id} 共 ${boxes.length} 箱面單已取得，運費 HK$${total_actual_label_fee} 由 ${ob.carrier_code} 直接收取。`,
      reference_type: "outbound",
      reference_id: outbound_id,
      action_url: `/zh-hk/outbound/${outbound_id}`,
    });

    return {
      outbound_id,
      box_count: boxes.length,
      total_label_fee: total_actual_label_fee,
      labels: labelResults,
    };
  } catch (err) {
    // Rollback to held(label_failed_retry). Per-box labels already obtained
    // remain (admin retry path will avoid duplicate fetches via box.status check).
    const now = new Date();
    await db.collection(collections.OUTBOUND).updateOne(
      { _id: outbound_id as any, status: "label_obtaining" },
      {
        $set: {
          status: "held",
          held_reason: "label_failed_retry",
          held_since: now,
          held_detail: String((err as any)?.message ?? err),
          updatedAt: now,
        },
      }
    );
    await appendOutboundScan(db, {
      outbound_id,
      type: "label_failed",
      operator_staff_id: operator_id ?? operator_type.toUpperCase(),
      details: { error: String((err as any)?.message ?? err) },
    });
    await appendActionLog(db, {
      outbound_id,
      client_id: ob.client_id,
      action: "label_failed",
      from_status: "label_obtaining",
      to_status: "held",
      actor_type: operator_type === "system" ? "system" : operator_type,
      actor_id: operator_id,
      detail: { error: String((err as any)?.message ?? err) },
    });
    await logAudit({
      action: AUDIT_ACTIONS.outbound_label_failed,
      actor_type:
        operator_type === "system"
          ? AUDIT_ACTOR_TYPES.system
          : operator_type === "client"
            ? AUDIT_ACTOR_TYPES.client
            : AUDIT_ACTOR_TYPES.admin,
      actor_id: operator_id,
      target_type: AUDIT_TARGET_TYPES.outbound,
      target_id: outbound_id,
      details: {
        error: String((err as any)?.message ?? err),
        carrier_code: ob.carrier_code,
      },
    });
    throw err;
  }
}

export async function clientConfirmLabel(
  client_id: string,
  outbound_id: string
) {
  const db = await connectToDatabase();
  const ob = await getOutbound(db, outbound_id);
  if (ob.client_id !== client_id) {
    throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outbound_id });
  }
  if (ob.status !== "pending_client_label") {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", { status: ob.status });
  }
  await logAudit({
    action: AUDIT_ACTIONS.outbound_label_client_confirmed,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: client_id,
    target_type: AUDIT_TARGET_TYPES.outbound,
    target_id: outbound_id,
    details: {},
  });
  return await fetchLabelMultiBox(outbound_id, "client", client_id);
}

/**
 * P13 — 合併取單. Fetch labels for N outbounds in one carrier API call,
 * grouped under a label_batches doc. All outbounds must share client +
 * carrier + warehouse + destination_country and be at pending_client_label.
 *
 * Atomic per Marco: all succeed or all roll back to pending_client_label.
 * No partial success state; the batch doc records status=failed with the
 * carrier-side error so the client can retry.
 */
export async function clientConfirmLabelBatch(
  client_id: string,
  outbound_ids: string[]
) {
  if (outbound_ids.length < 2) {
    throw new ApiError("BATCH_REQUIRES_AT_LEAST_TWO");
  }
  // De-dup defensively
  const uniqueIds = Array.from(new Set(outbound_ids));
  if (uniqueIds.length !== outbound_ids.length) {
    throw new ApiError("BATCH_DUPLICATE_OUTBOUND_IDS");
  }

  const db = await connectToDatabase();
  const obs = await db
    .collection(collections.OUTBOUND)
    .find({ _id: { $in: uniqueIds as any } })
    .toArray();
  if (obs.length !== uniqueIds.length) {
    throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", {
      orderId: uniqueIds.filter((id) => !obs.find((o: any) => o._id === id)).join(","),
    });
  }
  // Cohesion checks
  for (const o of obs as any[]) {
    if (o.client_id !== client_id) {
      throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: o._id });
    }
    if (o.status !== "pending_client_label") {
      throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", {
        status: o.status,
      });
    }
  }
  const carrierCodes = new Set((obs as any[]).map((o) => o.carrier_code));
  const warehouseCodes = new Set((obs as any[]).map((o) => o.warehouseCode));
  const destinations = new Set(
    (obs as any[]).map((o) => o.destination_country)
  );
  if (carrierCodes.size !== 1) {
    throw new ApiError("BATCH_MIXED_CARRIER");
  }
  if (warehouseCodes.size !== 1) {
    throw new ApiError("BATCH_MIXED_WAREHOUSE");
  }
  if (destinations.size !== 1) {
    throw new ApiError("BATCH_MIXED_DESTINATION");
  }
  const carrier_code = [...carrierCodes][0]!;
  const warehouseCode = [...warehouseCodes][0]!;
  const destination_country = [...destinations][0]!;

  // P11/P12 outbounds only have pack_boxes_v1; lazy-sync first.
  await ensureOutboundBoxesForOutbounds(db, uniqueIds);

  // Pull all boxes for all outbounds in one go
  const boxes = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id: { $in: uniqueIds } })
    .sort({ outbound_id: 1, box_no: 1 })
    .toArray();
  if (boxes.length === 0) {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", {
      status: "no_boxes",
    });
  }
  const boxesByOutbound = new Map<string, any[]>();
  for (const b of boxes as any[]) {
    const arr = boxesByOutbound.get(b.outbound_id) ?? [];
    arr.push(b);
    boxesByOutbound.set(b.outbound_id, arr);
  }
  // Every outbound must have at least one box
  for (const id of uniqueIds) {
    if (!boxesByOutbound.has(id)) {
      throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", {
        status: "no_boxes_for_" + id,
      });
    }
  }

  const warehouse = await db
    .collection(collections.WAREHOUSE)
    .findOne({ warehouseCode });

  const batch_id = await nextDailyId("BATCH");
  const now = new Date();

  // Insert the batch doc + atomic claim all outbounds → label_obtaining.
  await db.collection(collections.LABEL_BATCH).insertOne({
    _id: batch_id as any,
    client_id,
    warehouseCode,
    carrier_code,
    destination_country,
    outbound_ids: uniqueIds,
    box_count: boxes.length,
    status: "obtaining",
    requested_at: now,
    obtained_at: null,
    failed_at: null,
    error_message: null,
    total_actual_label_fee: 0,
    createdAt: now,
    updatedAt: now,
  } as any);

  const claim = await db.collection(collections.OUTBOUND).updateMany(
    {
      _id: { $in: uniqueIds as any },
      status: "pending_client_label",
    },
    {
      $set: {
        status: "label_obtaining",
        label_batch_id: batch_id,
        updatedAt: now,
      },
    }
  );
  if (claim.modifiedCount !== uniqueIds.length) {
    // Someone raced in between
    await db.collection(collections.OUTBOUND).updateMany(
      { _id: { $in: uniqueIds as any }, label_batch_id: batch_id },
      { $set: { status: "pending_client_label", updatedAt: new Date() }, $unset: { label_batch_id: "" } }
    );
    await db
      .collection(collections.LABEL_BATCH)
      .updateOne(
        { _id: batch_id as any },
        {
          $set: {
            status: "failed",
            failed_at: new Date(),
            error_message: "race condition: outbound status changed",
            updatedAt: new Date(),
          },
        }
      );
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", { status: "raced" });
  }

  await logAudit({
    action: AUDIT_ACTIONS.outbound_label_client_confirmed,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: client_id,
    target_type: AUDIT_TARGET_TYPES.outbound,
    target_id: uniqueIds.join(","),
    details: { batch_id, outbound_count: uniqueIds.length },
  });

  try {
    const adapter = await getCarrierAdapter(carrier_code);
    const items = (obs as any[]).map((o) => ({
      outbound_id: String(o._id),
      receiver_name: o.receiver_address?.name ?? "",
      receiver_address: [
        o.receiver_address?.address,
        o.receiver_address?.city,
        o.receiver_address?.country_code,
      ]
        .filter(Boolean)
        .join(", "),
      boxes: (boxesByOutbound.get(String(o._id)) ?? []).map((b: any) => ({
        box_id: String(b._id),
        box_no: b.box_no,
        weight_kg: b.weight_actual ?? b.weight_estimate,
        dimensions: b.dimensions,
      })),
    }));
    const result = await adapter.fetchLabelBatch({
      batch_id,
      destination_country,
      sender_name: warehouse?.name_zh ?? warehouse?.name_en ?? warehouseCode,
      sender_address: warehouse?.address_zh ?? warehouse?.address_en ?? "",
      items,
    });

    // Persist per-box + per-outbound + batch totals
    let totalFee = 0;
    for (const ob of result.per_outbound) {
      let outboundFee = 0;
      const tracking_numbers: string[] = [];
      for (const b of ob.boxes) {
        await db.collection(collections.OUTBOUND_BOX).updateOne(
          { _id: b.box_id as any },
          {
            $set: {
              label_pdf_path: b.label_url,
              tracking_no_carrier: b.tracking_no,
              actual_label_fee: b.charged_amount,
              label_obtained_at: now,
              label_obtained_by_operator_type: "client",
              status: "label_obtained",
              updatedAt: now,
            },
          }
        );
        await appendOutboundScan(db, {
          outbound_id: ob.outbound_id,
          box_id: b.box_id,
          type: "label_obtained",
          operator_staff_id: client_id,
          details: {
            tracking_no: b.tracking_no,
            fee: b.charged_amount,
            box_no: b.box_no,
            batch_id,
          },
        });
        outboundFee += b.charged_amount;
        tracking_numbers.push(b.tracking_no);
      }
      const firstBox = ob.boxes[0];
      await db.collection(collections.OUTBOUND).updateOne(
        { _id: ob.outbound_id as any },
        {
          $set: {
            status: "label_obtained",
            label_url: firstBox?.label_url ?? null,
            tracking_no: firstBox?.tracking_no ?? null,
            actual_label_fee: outboundFee,
            label_obtained_at: now,
            label_obtained_by_operator_type: "client",
            label_obtained_by_operator_id: client_id,
            held_reason: null,
            held_since: null,
            held_detail: null,
            updatedAt: now,
          },
        }
      );
      await appendActionLog(db, {
        outbound_id: ob.outbound_id,
        client_id,
        action: "label_obtained",
        from_status: "label_obtaining",
        to_status: "label_obtained",
        actor_type: "client",
        actor_id: client_id,
        detail: {
          batch_id,
          box_count: ob.boxes.length,
          total_label_fee: outboundFee,
          tracking_numbers,
        },
      });
      await createNotification({
        client_id,
        type: "outbound_label_obtained",
        title: "出庫面單已取得（合併取單）",
        body: `出庫單 ${ob.outbound_id} 共 ${ob.boxes.length} 箱面單已取得（批次 ${batch_id}）。`,
        reference_type: "outbound",
        reference_id: ob.outbound_id,
        action_url: `/zh-hk/outbound/${ob.outbound_id}`,
      });
      totalFee += outboundFee;
    }

    await db.collection(collections.LABEL_BATCH).updateOne(
      { _id: batch_id as any },
      {
        $set: {
          status: "obtained",
          obtained_at: now,
          total_actual_label_fee: totalFee,
          updatedAt: now,
        },
      }
    );
    await logAudit({
      action: AUDIT_ACTIONS.outbound_label_obtained,
      actor_type: AUDIT_ACTOR_TYPES.client,
      actor_id: client_id,
      target_type: AUDIT_TARGET_TYPES.outbound,
      target_id: uniqueIds.join(","),
      details: {
        batch_id,
        outbound_count: uniqueIds.length,
        total: totalFee,
        carrier_code,
      },
    });

    return {
      batch_id,
      outbound_count: uniqueIds.length,
      box_count: boxes.length,
      total_label_fee: totalFee,
    };
  } catch (err) {
    // All-or-nothing: rollback every outbound back to pending_client_label
    // and mark batch failed. Per-box label state untouched since adapter
    // throws atomically without producing partial writes.
    const failedAt = new Date();
    const msg = String((err as any)?.message ?? err);
    await db.collection(collections.OUTBOUND).updateMany(
      { _id: { $in: uniqueIds as any }, status: "label_obtaining" },
      {
        $set: {
          status: "pending_client_label",
          held_detail: msg,
          updatedAt: failedAt,
        },
        $unset: { label_batch_id: "" },
      }
    );
    await db.collection(collections.LABEL_BATCH).updateOne(
      { _id: batch_id as any },
      {
        $set: {
          status: "failed",
          failed_at: failedAt,
          error_message: msg,
          updatedAt: failedAt,
        },
      }
    );
    await logAudit({
      action: AUDIT_ACTIONS.outbound_label_failed,
      actor_type: AUDIT_ACTOR_TYPES.client,
      actor_id: client_id,
      target_type: AUDIT_TARGET_TYPES.outbound,
      target_id: uniqueIds.join(","),
      details: { batch_id, error: msg, carrier_code },
    });
    throw err;
  }
}

export async function labelPrintComplete(
  ctx: StaffContext,
  outbound_id: string
) {
  const db = await connectToDatabase();
  const ob = await getOutbound(db, outbound_id);
  if (ob.status !== "label_obtained") {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_PRINT", { status: ob.status });
  }
  const now = new Date();
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.OUTBOUND).updateOne(
        { _id: outbound_id as any, status: "label_obtained" },
        {
          $set: {
            status: "label_printed",
            label_printed_at: now,
            label_printed_by_staff_id: ctx.staff_id,
            updatedAt: now,
          },
        },
        { session }
      );
      await db
        .collection(collections.OUTBOUND_BOX)
        .updateMany(
          { outbound_id, status: "label_obtained" },
          { $set: { status: "label_printed", updatedAt: now } },
          { session }
        );
    });
  } finally {
    await session.endSession();
  }
  await appendActionLog(db, {
    outbound_id,
    client_id: ob.client_id,
    action: "label_printed",
    from_status: "label_obtained",
    to_status: "label_printed",
    actor_type: "wms_staff",
    actor_id: ctx.staff_id,
  });
  await logAudit({
    action: AUDIT_ACTIONS.outbound_label_printed,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.outbound,
    target_id: outbound_id,
    details: {},
    warehouse_code: ctx.warehouseCode,
  });
  const after = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  return projectOutboundV1(after);
}

export async function listWeighableOutbounds(warehouseCode?: string) {
  const db = await connectToDatabase();
  const filter: any = { status: { $in: ["packed", "weighing"] } };
  if (warehouseCode) filter.warehouseCode = warehouseCode;
  const docs = await db
    .collection(collections.OUTBOUND)
    .find(filter)
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray();
  return docs.map(projectOutboundV1);
}

export async function listLabelPrintableOutbounds(warehouseCode?: string) {
  const db = await connectToDatabase();
  const filter: any = {
    status: { $in: ["pending_client_label", "label_obtained", "label_printed"] },
  };
  if (warehouseCode) filter.warehouseCode = warehouseCode;
  const docs = await db
    .collection(collections.OUTBOUND)
    .find(filter)
    .sort({ updatedAt: 1 })
    .limit(200)
    .toArray();

  const outboundIds = (docs as any[]).map((d) => String(d._id));
  const clientIds = Array.from(
    new Set((docs as any[]).map((d) => d.client_id).filter(Boolean))
  );

  // Client lookup — clients._id is ObjectId; outbound.client_id is the
  // string form, so convert before $in.
  const clientObjectIds = clientIds
    .map((id) => {
      try {
        return new ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter((x): x is ObjectId => x !== null);
  const clientDocs = clientObjectIds.length
    ? await db
        .collection(collections.CLIENT)
        .find({ _id: { $in: clientObjectIds } })
        .project({ code: 1, display_name: 1, email: 1 })
        .toArray()
    : [];
  const clientById = new Map<string, any>();
  for (const c of clientDocs as any[]) {
    clientById.set(String(c._id), c);
  }

  // Aggregate hazard flags (contains_battery / contains_liquid) per outbound
  // by walking outbound_inbound_links → inbound_requests. OR across all
  // inbounds attached to the outbound; null-safe.
  const hazardById = new Map<
    string,
    { contains_battery: boolean; contains_liquid: boolean }
  >();
  if (outboundIds.length > 0) {
    const links = await db
      .collection(collections.OUTBOUND_INBOUND_LINK)
      .find({ outbound_id: { $in: outboundIds }, unlinked_at: null })
      .project({ outbound_id: 1, inbound_id: 1 })
      .toArray();
    const inboundIds = Array.from(
      new Set((links as any[]).map((l) => l.inbound_id))
    );
    const inbounds = inboundIds.length
      ? await db
          .collection(collections.INBOUND)
          .find({ _id: { $in: inboundIds as any } })
          .project({ contains_battery: 1, contains_liquid: 1 })
          .toArray()
      : [];
    const inboundFlagsById = new Map<
      string,
      { contains_battery: boolean; contains_liquid: boolean }
    >();
    for (const i of inbounds as any[]) {
      inboundFlagsById.set(String(i._id), {
        contains_battery: !!i.contains_battery,
        contains_liquid: !!i.contains_liquid,
      });
    }
    for (const oid of outboundIds) {
      hazardById.set(oid, { contains_battery: false, contains_liquid: false });
    }
    for (const l of links as any[]) {
      const flags = inboundFlagsById.get(String(l.inbound_id));
      if (!flags) continue;
      const cur = hazardById.get(String(l.outbound_id))!;
      cur.contains_battery = cur.contains_battery || flags.contains_battery;
      cur.contains_liquid = cur.contains_liquid || flags.contains_liquid;
    }
  }

  // Pack box count per outbound — pack boxes are client-scoped + items[].outbound_id
  const boxCountById = new Map<string, number>();
  if (outboundIds.length > 0) {
    const grouped = await db
      .collection(collections.PACK_BOX_V1)
      .aggregate([
        { $match: { "items.outbound_id": { $in: outboundIds } } },
        { $unwind: "$items" },
        { $match: { "items.outbound_id": { $in: outboundIds } } },
        {
          $group: {
            _id: { outbound_id: "$items.outbound_id", box: "$_id" },
          },
        },
        { $group: { _id: "$_id.outbound_id", count: { $sum: 1 } } },
      ])
      .toArray();
    for (const g of grouped as any[]) {
      boxCountById.set(String(g._id), g.count ?? 0);
    }
  }

  const pendingIds = (docs as any[])
    .filter((d) => d.status === "pending_client_label")
    .map((d) => String(d._id));

  let notifyStats = new Map<
    string,
    { notified_count: number; last_notified_at: Date | null }
  >();
  if (pendingIds.length > 0) {
    const notifs = await db
      .collection(collections.NOTIFICATION)
      .aggregate([
        {
          $match: {
            type: "outbound_pending_client_label",
            reference_type: "outbound",
            reference_id: { $in: pendingIds },
          },
        },
        {
          $group: {
            _id: "$reference_id",
            count: { $sum: 1 },
            last: { $max: "$createdAt" },
          },
        },
      ])
      .toArray();
    for (const n of notifs as any[]) {
      notifyStats.set(String(n._id), {
        notified_count: n.count ?? 0,
        last_notified_at: n.last ?? null,
      });
    }
  }

  return (docs as any[]).map((d) => {
    const c = clientById.get(String(d.client_id));
    const haz = hazardById.get(String(d._id));
    return {
      ...projectOutboundV1(d),
      client_code: c?.code ?? null,
      client_display_name: c?.display_name ?? null,
      client_email: c?.email ?? null,
      box_count: boxCountById.get(String(d._id)) ?? 0,
      contains_battery: !!haz?.contains_battery,
      contains_liquid: !!haz?.contains_liquid,
      notified_count: notifyStats.get(String(d._id))?.notified_count ?? 0,
      last_notified_at:
        notifyStats.get(String(d._id))?.last_notified_at ?? null,
    };
  });
}

/**
 * Detail panel data for the label-print page: every pack box covering this
 * outbound, the items inside (filtered to this outbound only — pack boxes
 * are client-scoped and can hold items from sibling outbounds), and per-item
 * inbound metadata so warehouse staff can verify physical packages.
 *
 * For label_obtained / label_printed outbounds we also overlay
 * `tracking_no_carrier` + `label_pdf_path` from OUTBOUND_BOX (matched by
 * box_no) so the panel can offer label PDF preview / download.
 */
export async function getLabelPrintOutboundDetail(outbound_id: string) {
  const db = await connectToDatabase();
  const ob = await getOutbound(db, outbound_id);

  const packBoxes = await db
    .collection(collections.PACK_BOX_V1)
    .find({ "items.outbound_id": outbound_id })
    .sort({ box_no: 1 })
    .toArray();

  const inboundIds = new Set<string>();
  for (const b of packBoxes as any[]) {
    for (const it of b.items ?? []) {
      if (it.outbound_id === outbound_id) inboundIds.add(it.inbound_id);
    }
  }
  const inbounds = inboundIds.size
    ? await db
        .collection(collections.INBOUND)
        .find({ _id: { $in: [...inboundIds] as any } })
        .project({
          _id: 1,
          tracking_no: 1,
          actualWeight: 1,
          carrier_inbound_code: 1,
          size_estimate: 1,
        })
        .toArray()
    : [];
  const inboundById = new Map<string, any>();
  for (const i of inbounds as any[]) inboundById.set(String(i._id), i);

  // Overlay label info from OUTBOUND_BOX (legacy boxes carry label_pdf_path)
  const outboundBoxes = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id })
    .project({ box_no: 1, label_pdf_path: 1, tracking_no_carrier: 1, status: 1 })
    .toArray();
  const obBoxByNo = new Map<string, any>();
  for (const b of outboundBoxes as any[]) obBoxByNo.set(b.box_no, b);

  const boxes = (packBoxes as any[]).map((b) => {
    const ownItems = (b.items ?? []).filter(
      (it: any) => it.outbound_id === outbound_id
    );
    const obBox = obBoxByNo.get(b.box_no);
    return {
      box_no: b.box_no,
      width: b.width ?? 0,
      length: b.length ?? 0,
      height: b.height ?? 0,
      weight: b.weight ?? 0,
      sealed_at: b.sealed_at ?? null,
      label_pdf_path: obBox?.label_pdf_path ?? null,
      tracking_no_carrier: obBox?.tracking_no_carrier ?? null,
      items: ownItems.map((it: any) => {
        const inb = inboundById.get(String(it.inbound_id));
        return {
          inbound_id: it.inbound_id,
          tracking_no: it.tracking_no ?? inb?.tracking_no ?? null,
          actual_weight: inb?.actualWeight ?? null,
          carrier_inbound_code: inb?.carrier_inbound_code ?? null,
        };
      }),
    };
  });

  return {
    outbound_id,
    status: ob.status,
    carrier_code: ob.carrier_code,
    destination_country: ob.destination_country,
    inbound_count: ob.inbound_count ?? 0,
    box_count: boxes.length,
    boxes,
  };
}

/**
 * Send a "please go obtain label" reminder to the client for an outbound
 * still sitting at `pending_client_label`. Mock email logged to console;
 * in-app notification row written; audit log appended. Outbound status
 * is NOT mutated — client still has to come back to OMS and confirm.
 */
export async function notifyClientPendingLabel(
  ctx: StaffContext,
  outbound_id: string
) {
  const db = await connectToDatabase();
  const ob = await getOutbound(db, outbound_id);
  if (ob.status !== "pending_client_label") {
    throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", {
      status: ob.status,
    });
  }
  const { notification_id } = await createNotification({
    client_id: ob.client_id,
    type: "outbound_pending_client_label",
    title: "倉庫提醒：請回 OMS 確認取運單",
    body: `出庫單 ${outbound_id} 已完成秤重置板，倉庫人員提醒您回 OMS 確認並取運單，以便後續貼標出倉。`,
    reference_type: "outbound",
    reference_id: outbound_id,
    action_url: `/zh-hk/outbound/${outbound_id}/confirm-label`,
  });
  // Mock email — real send deferred to production.
  console.log(
    `[mock-email] to client_id=${ob.client_id} outbound=${outbound_id} subject="請回 OMS 確認取運單"`
  );
  await logAudit({
    action: AUDIT_ACTIONS.outbound_notify_client_label,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.outbound,
    target_id: outbound_id,
    details: { notification_id },
    warehouse_code: ctx.warehouseCode,
  });
  return { outbound_id, notification_id };
}

// ─────────────────────────────────────────────────────────────
// Stage 8 — Depart (PDA scan each box)
// ─────────────────────────────────────────────────────────────

export async function departBox(ctx: StaffContext, box_no: string) {
  const db = await connectToDatabase();
  const now = new Date();
  // Atomic claim: only the first scan transitions label_printed → departed.
  const claimRaw = await db.collection(collections.OUTBOUND_BOX).findOneAndUpdate(
    { box_no, status: "label_printed" },
    { $set: { status: "departed", departed_at: now, updatedAt: now } },
    { returnDocument: "after" }
  );
  const claim: any =
    claimRaw && (claimRaw as any).value !== undefined
      ? (claimRaw as any).value
      : claimRaw;
  if (!claim) {
    // Differentiate: not found vs already departed.
    const existing = await db
      .collection(collections.OUTBOUND_BOX)
      .findOne({ box_no });
    if (!existing) throw new ApiError("BOX_NOT_FOUND", { boxNo: box_no });
    if (existing.status === "departed") {
      throw new ApiError("BOX_ALREADY_DEPARTED");
    }
    throw new ApiError("BOX_NOT_AVAILABLE_FOR_DEPART", { status: existing.status });
  }
  const outbound_id = claim.outbound_id;
  const ob = await getOutbound(db, outbound_id);

  await appendOutboundScan(db, {
    outbound_id,
    box_id: String(claim._id),
    type: "box_departed",
    operator_staff_id: ctx.staff_id,
    details: { box_no },
  });

  // Are all boxes departed?
  const remaining = await db
    .collection(collections.OUTBOUND_BOX)
    .countDocuments({
      outbound_id,
      status: { $ne: "departed" },
    });
  let outbound_departed = false;
  if (remaining === 0) {
    const upd = await db.collection(collections.OUTBOUND).updateOne(
      { _id: outbound_id as any, status: "label_printed" },
      {
        $set: { status: "departed", departed_at: now, updatedAt: now },
      }
    );
    if (upd.modifiedCount > 0) {
      outbound_departed = true;
      // Flip linked inbounds to departed.
      const links = await db
        .collection(collections.OUTBOUND_INBOUND_LINK)
        .find({ outbound_id, unlinked_at: null })
        .toArray();
      const inboundIds = links.map((l: any) => l.inbound_id);
      if (inboundIds.length > 0) {
        await db.collection(collections.INBOUND).updateMany(
          { _id: { $in: inboundIds as any }, status: { $in: ["packed", "picking"] } },
          { $set: { status: "departed", departedAt: now, updatedAt: now } }
        );
      }
      await appendOutboundScan(db, {
        outbound_id,
        type: "outbound_departed",
        operator_staff_id: ctx.staff_id,
      });
      await appendActionLog(db, {
        outbound_id,
        client_id: ob.client_id,
        action: "departed",
        from_status: "label_printed",
        to_status: "departed",
        actor_type: "wms_staff",
        actor_id: ctx.staff_id,
      });
      await logAudit({
        action: AUDIT_ACTIONS.outbound_departed,
        actor_type: AUDIT_ACTOR_TYPES.wms_staff,
        actor_id: ctx.staff_id,
        target_type: AUDIT_TARGET_TYPES.outbound,
        target_id: outbound_id,
        details: {},
        warehouse_code: ctx.warehouseCode,
      });
      const trackingList = await db
        .collection(collections.OUTBOUND_BOX)
        .find({ outbound_id }, { projection: { box_no: 1, tracking_no_carrier: 1 } })
        .toArray();
      await createNotification({
        client_id: ob.client_id,
        type: "outbound_departed",
        title: "您的出庫單已發出",
        body: `出庫單 ${outbound_id} 共 ${trackingList.length} 箱已離倉發出，追蹤號：${trackingList
          .map((t: any) => t.tracking_no_carrier)
          .filter(Boolean)
          .join(", ")}`,
        reference_type: "outbound",
        reference_id: outbound_id,
        action_url: `/zh-hk/outbound/${outbound_id}`,
      });
    }
  } else {
    await logAudit({
      action: AUDIT_ACTIONS.outbound_box_departed,
      actor_type: AUDIT_ACTOR_TYPES.wms_staff,
      actor_id: ctx.staff_id,
      target_type: AUDIT_TARGET_TYPES.outbound_box,
      target_id: String(claim._id),
      details: { box_no, outbound_id },
      warehouse_code: ctx.warehouseCode,
    });
  }
  const totalBoxes = await db
    .collection(collections.OUTBOUND_BOX)
    .countDocuments({ outbound_id });
  const departedBoxes = await db
    .collection(collections.OUTBOUND_BOX)
    .countDocuments({ outbound_id, status: "departed" });
  return {
    outbound_id,
    box_no,
    outbound_departed,
    progress: { departed: departedBoxes, total: totalBoxes },
  };
}

/**
 * Staff-wide outbound list for the desktop "出庫任務" overview page.
 * Unlike the per-stage listables, this one ignores status by default
 * and exposes a generic filter.
 */
export async function listAllOutboundsForStaff(params: {
  warehouseCode?: string;
  status?: string[];
  limit?: number;
  offset?: number;
  q?: string;
}) {
  const db = await connectToDatabase();
  const filter: Record<string, any> = {};
  if (params.warehouseCode) filter.warehouseCode = params.warehouseCode;
  if (params.status && params.status.length > 0)
    filter.status = { $in: params.status };
  if (params.q && params.q.trim()) {
    const q = params.q.trim();
    filter.$or = [
      { _id: { $regex: q, $options: "i" } },
      { client_id: { $regex: q, $options: "i" } },
      { tracking_no: { $regex: q, $options: "i" } },
    ];
  }
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;
  const total = await db.collection(collections.OUTBOUND).countDocuments(filter);
  const docs = await db
    .collection(collections.OUTBOUND)
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  return { items: docs.map(projectOutboundV1), total };
}

export async function listDepartableOutbounds(warehouseCode?: string) {
  const db = await connectToDatabase();
  const filter: any = { status: "label_printed" };
  if (warehouseCode) filter.warehouseCode = warehouseCode;
  const docs = await db
    .collection(collections.OUTBOUND)
    .find(filter)
    .sort({ label_printed_at: 1 })
    .limit(100)
    .toArray();
  const ids = docs.map((d: any) => d._id);
  const boxes = ids.length
    ? await db
        .collection(collections.OUTBOUND_BOX)
        .find({ outbound_id: { $in: ids } })
        .project({ outbound_id: 1, box_no: 1, status: 1 })
        .sort({ box_no: 1 })
        .toArray()
    : [];
  const byOutbound = new Map<string, { box_no: string; status: string }[]>();
  for (const b of boxes as any[]) {
    const arr = byOutbound.get(b.outbound_id) ?? [];
    arr.push({ box_no: b.box_no, status: b.status });
    byOutbound.set(b.outbound_id, arr);
  }
  return docs.map((d: any) => ({
    ...projectOutboundV1(d),
    boxes: byOutbound.get(d._id) ?? [],
  }));
}

/**
 * Depart every still-pending box for an outbound in one call. Used by
 * desktop batch-action UI where the operator has already verified the
 * whole outbound physically. Delegates each box to {@link departBox} so
 * the per-box atomicity + outbound-aggregate transition logic is reused.
 */
export async function departOutboundAll(ctx: StaffContext, outbound_id: string) {
  const db = await connectToDatabase();
  const pending = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id, status: "label_printed" })
    .project({ box_no: 1 })
    .toArray();
  if (pending.length === 0) {
    throw new ApiError("BOX_NOT_AVAILABLE_FOR_DEPART", { status: "none_pending" });
  }
  const results = [];
  for (const b of pending as any[]) {
    const r = await departBox(ctx, b.box_no);
    results.push(r);
  }
  const last = results[results.length - 1];
  return {
    outbound_id,
    departed_count: results.length,
    outbound_departed: last?.outbound_departed === true,
  };
}

export const wmsFlow = {
  pickInbound,
  createBox,
  completePacking,
  weighBox,
  completeWeighing,
  fetchLabelMultiBox,
  clientConfirmLabel,
  labelPrintComplete,
  departBox,
  departOutboundAll,
  listPickableOutbounds,
  getPickDetail,
  listPackableOutbounds,
  listBoxes,
  listWeighableOutbounds,
  listLabelPrintableOutbounds,
  listDepartableOutbounds,
  listAllOutboundsForStaff,
  notifyClientPendingLabel,
  getLabelPrintOutboundDetail,
  clientConfirmLabelBatch,
};

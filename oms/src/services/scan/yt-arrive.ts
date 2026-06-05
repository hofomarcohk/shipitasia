// P17 — YT (雲途) arrive + shelve.
//
// Branched off the generic scan-service flow because YT parcels:
//   - have no client_id (sentinel SYS-YT)
//   - have no OMS forecast (so no declared_items, declared_value)
//   - bypass wallet charge (system-paid via fuuffy)
//   - auto-append to today's YT outbound at shelve
//
// PDA chooses which endpoint to call by feeding tracking_no +
// arriveLookup result into classifyArrival(); a "yt" verdict routes
// here, the other verdicts use scan-service's existing paths.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { SYSTEM_CLIENT_ID } from "@/cst/system";
import { isYTTracking } from "@/lib/yt";
import { connectToDatabase, getMongoClient } from "@/lib/mongo";
import { logAudit } from "@/services/audit/log";
import { appendYtInbound } from "@/services/outbound/yt-service";
import { getLocation } from "@/services/scan/locations";
import { nextDailyId } from "@/services/util/daily-counter";
import { normalizeTrackingNo } from "@/types/InboundV1";
import { DimensionSchema } from "@/types/Scan";
import { z } from "zod";

import type { StaffContext } from "./scan-service";

// ── schemas ────────────────────────────────────────────────

export const YtQuickArriveSchema = z
  .object({
    tracking_no: z.string().min(1),
  })
  .strict();

export const YtShelveSchema = z
  .object({
    inbound_id: z.string().optional(),
    tracking_no: z.string().min(1).optional(),
    locationCode: z.string().min(1),
    weight: z.coerce.number().positive(),
    dimension: DimensionSchema,
    staff_note: z.string().max(500).optional(),
  })
  .strict()
  .refine((d) => !!d.inbound_id || !!d.tracking_no, {
    message: "either inbound_id or tracking_no is required",
    path: ["inbound_id"],
  });

// ── S2 quick arrive ────────────────────────────────────────
//
// Creates an inbound_requests row with is_yt=true under the SYS-YT
// sentinel client. Dedupe: if a YT row with the same tracking already
// exists at this warehouse and is still pending or arrived, the second
// scan is rejected with INBOUND_DUPLICATED.

export async function quickArriveYt(
  raw: unknown,
  ctx: StaffContext
): Promise<{ success: true; inbound_id: string; scan_id: string }> {
  const input = YtQuickArriveSchema.parse(raw);
  if (!isYTTracking(input.tracking_no)) {
    throw new ApiError("YT_TRACKING_REQUIRED", {
      detail: `tracking ${input.tracking_no} does not match YT prefix`,
    });
  }
  const db = await connectToDatabase();
  const normalized = normalizeTrackingNo(input.tracking_no);

  const dup = await db.collection(collections.INBOUND).findOne({
    tracking_no_normalized: normalized,
    warehouseCode: ctx.warehouseCode,
    status: { $in: ["pending", "arrived"] },
  });
  if (dup) throw new ApiError("INBOUND_DUPLICATED");

  const inbound_id = await nextDailyId("I");
  const scan_id = await nextDailyId("S");
  const now = new Date();
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.INBOUND).insertOne(
        {
          _id: inbound_id as any,
          client_id: SYSTEM_CLIENT_ID,
          warehouseCode: ctx.warehouseCode,
          carrier_inbound_code: "yt",
          tracking_no: input.tracking_no,
          tracking_no_normalized: normalized,
          tracking_no_other: null,
          // Placeholder shipping fields — YT bypasses OMS forecast so
          // these never come from the customer. Kept non-null so
          // downstream code that reads them doesn't NPE.
          inbound_source: "regular",
          size_estimate: "small",
          size_estimate_note: null,
          contains_liquid: false,
          contains_battery: false,
          shipping_mode: "manual_consolidate",
          shipping_destination: null,
          consolidation_group_id: null,
          customer_remarks: null,
          declared_value_total: 0,
          declared_currency: "JPY",
          declared_items_count: 0,
          status: "arrived",
          cancelled_at: null,
          cancel_reason: null,
          abandoned_at: null,
          abandoned_reason: null,
          abandoned_by_client: null,
          abandoned_by_staff_id: null,
          abandon_warning_sent_at: null,
          arrivedAt: now,
          receivedAt: null,
          actualWeight: null,
          actualDimension: null,
          is_yt: true,
          last_scan_id: scan_id,
          last_scan_at: now,
          createdAt: now,
          updatedAt: now,
        } as any,
        { session }
      );
      await db.collection(collections.INBOUND_SCAN).insertOne(
        {
          _id: scan_id as any,
          inbound_request_id: inbound_id,
          unclaimed_inbound_id: null,
          client_id: SYSTEM_CLIENT_ID,
          type: "inbound_arrived",
          locationCode: null,
          weight: null,
          dimension: null,
          photo_paths: [],
          photo_metadata: [],
          anomalies: [],
          operator_staff_id: ctx.staff_id,
          is_combined_arrive: false,
          staff_note: null,
          cancelled_at: null,
          cancelled_reason: null,
          createdAt: now,
        } as any,
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await logAudit({
    action: AUDIT_ACTIONS.inbound_arrived,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: inbound_id,
    details: {
      scan_id,
      tracking_no: input.tracking_no,
      is_yt: true,
      flow: "yt_quick_arrive",
    },
    warehouse_code: ctx.warehouseCode,
  });

  return { success: true, inbound_id, scan_id };
}

// ── S3 shelve + auto-append ────────────────────────────────
//
// Fills location + weight + dimension + photos. On success, calls
// appendYtInbound() so the parcel auto-joins today's YT outbound.
// Wallet / client notification deliberately skipped (system-paid +
// no customer to notify).

export async function performYtShelve(
  raw: unknown,
  ctx: StaffContext,
  photos: {
    barcode_paths: string[];
    package_paths: string[];
    metadata: { type: "barcode" | "package" | "anomaly"; size: number; mime: string }[];
  }
): Promise<{
  success: true;
  inbound_id: string;
  scan_id: string;
  yt_outbound_id: string;
  yt_inbound_count: number;
}> {
  const input = YtShelveSchema.parse(raw);
  const db = await connectToDatabase();
  await getLocation(ctx.warehouseCode, input.locationCode);

  const filter: Record<string, unknown> = {
    warehouseCode: ctx.warehouseCode,
    is_yt: true,
  };
  if (input.inbound_id) {
    filter._id = input.inbound_id;
  } else {
    filter.tracking_no_normalized = normalizeTrackingNo(input.tracking_no!);
    filter.status = { $in: ["pending", "arrived"] };
  }
  const inbound = await db
    .collection(collections.INBOUND)
    .findOne(filter as any);
  if (!inbound) throw new ApiError("INBOUND_NOT_FOUND");
  if (inbound.status === "received") throw new ApiError("ALREADY_RECEIVED");

  // W5: PC station may not have camera — photos optional for YT shelve
  const allPhotos = [...photos.barcode_paths, ...photos.package_paths];

  const scan_id = await nextDailyId("S");
  const session = getMongoClient().startSession();
  const now = new Date();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.INBOUND_SCAN).insertOne(
        {
          _id: scan_id as any,
          inbound_request_id: inbound._id,
          unclaimed_inbound_id: null,
          client_id: SYSTEM_CLIENT_ID,
          type: "receive",
          locationCode: input.locationCode,
          weight: input.weight,
          dimension: input.dimension,
          photo_paths: allPhotos,
          photo_metadata: photos.metadata,
          anomalies: [],
          operator_staff_id: ctx.staff_id,
          is_combined_arrive: false,
          staff_note: input.staff_note ?? null,
          cancelled_at: null,
          cancelled_reason: null,
          createdAt: now,
        } as any,
        { session }
      );
      await db.collection(collections.ITEM_LOCATION).updateOne(
        { itemCode: inbound._id },
        {
          $set: {
            itemCode: inbound._id,
            itemType: "shipment",
            warehouseCode: ctx.warehouseCode,
            locationCode: input.locationCode,
            currentStatus: "in_storage",
            placedBy: ctx.staff_id,
            lastMovedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, session }
      );
      await db.collection(collections.INBOUND).updateOne(
        { _id: inbound._id, status: { $in: ["pending", "arrived"] } },
        {
          $set: {
            status: "received",
            receivedAt: now,
            actualWeight: input.weight,
            actualDimension: input.dimension,
            last_scan_id: scan_id,
            last_scan_at: now,
            updatedAt: now,
          },
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  // Auto-append outside the session so getOrCreateTodayYtOutbound can
  // open its own writes without nesting transactions. If this throws,
  // the inbound is already shelved — caller / cron sweeper can retry
  // the append separately.
  const appended = await appendYtInbound({
    inbound_id: String(inbound._id),
    warehouseCode: ctx.warehouseCode,
  });

  await logAudit({
    action: AUDIT_ACTIONS.inbound_received,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: String(inbound._id),
    details: {
      scan_id,
      locationCode: input.locationCode,
      is_yt: true,
      yt_outbound_id: appended.outbound_id,
      flow: "yt_shelve",
    },
    warehouse_code: ctx.warehouseCode,
  });

  return {
    success: true,
    inbound_id: String(inbound._id),
    scan_id,
    yt_outbound_id: appended.outbound_id,
    yt_inbound_count: appended.inbound_count,
  };
}

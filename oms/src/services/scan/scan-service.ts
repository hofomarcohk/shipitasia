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
import { getLocation } from "@/services/scan/locations";
import { unlinkPhotos } from "@/services/scan/photo-upload";
import { nextDailyId } from "@/services/util/daily-counter";
import { walletService } from "@/services/wallet/walletService";
import { normalizeTrackingNo } from "@/types/InboundV1";
import {
  AnomalyInput,
  ArriveInputSchema,
  ReceiveInputSchema,
  UnclaimedRegisterSchema,
  projectScan,
  projectUnclaimed,
} from "@/types/Scan";
import { z } from "zod";

export interface StaffContext {
  staff_id: string;
  warehouseCode: string;
  ip_address?: string;
  user_agent?: string;
}

// ── lookup helpers (PDA onBlur) ─────────────────────────────

export async function arriveLookup(
  tracking_no: string,
  warehouseCode: string
) {
  const db = await connectToDatabase();
  const normalized = normalizeTrackingNo(tracking_no);
  if (!normalized) return { matched: false as const };
  const doc = await db.collection(collections.INBOUND).findOne({
    tracking_no_normalized: normalized,
    warehouseCode,
    status: { $in: ["pending", "arrived"] },
  });
  if (!doc) return { matched: false as const };
  const items = await db
    .collection(collections.INBOUND_DECLARED_ITEM)
    .find({ inbound_request_id: doc._id })
    .sort({ display_order: 1 })
    .toArray();
  return {
    matched: true as const,
    inbound: {
      _id: doc._id,
      client_id: doc.client_id,
      status: doc.status,
      shipment_type: doc.shipment_type,
      inbound_source: doc.inbound_source,
      size_estimate: doc.size_estimate,
      contains_liquid: doc.contains_liquid,
      contains_battery: doc.contains_battery,
      tracking_no: doc.tracking_no,
      carrier_inbound_code: doc.carrier_inbound_code,
      declared_items_count: doc.declared_items_count,
    },
    declared_items: items.map((i: any) => ({
      _id: String(i._id),
      product_name: i.product_name,
      quantity: i.quantity,
    })),
  };
}

export async function receiveLookup(
  identifier: string,
  warehouseCode: string
) {
  const db = await connectToDatabase();
  // Try by inbound_id first (I-...), fall back to tracking_no
  let doc: any = null;
  if (identifier.startsWith("I-")) {
    doc = await db
      .collection(collections.INBOUND)
      .findOne({ _id: identifier as any });
  }
  if (!doc) {
    const normalized = normalizeTrackingNo(identifier);
    doc = await db.collection(collections.INBOUND).findOne({
      tracking_no_normalized: normalized,
      warehouseCode,
    });
  }
  if (!doc) return { matched: false as const };
  return {
    matched: true as const,
    inbound: {
      _id: doc._id,
      client_id: doc.client_id,
      status: doc.status,
      shipment_type: doc.shipment_type,
      tracking_no: doc.tracking_no,
      // Prefer last_scan-derived values when arrive has run
      actualWeight: doc.actualWeight ?? null,
      actualDimension: doc.actualDimension ?? null,
    },
  };
}

// ── arrive ─────────────────────────────────────────────────

const UNDO_WINDOW_MS = 5 * 60 * 1000;

function buildAnomaliesPayload(anomalies: AnomalyInput[]) {
  return anomalies.map((a) => ({
    code: a.code,
    note: a.note,
    photo_paths: a.photo_paths,
  }));
}

export async function performArrive(
  raw: unknown,
  ctx: StaffContext,
  photos: {
    barcode_paths: string[];
    package_paths: string[];
    metadata: { type: "barcode" | "package" | "anomaly"; size: number; mime: string }[];
  }
) {
  const input = ArriveInputSchema.parse(raw);
  if (photos.barcode_paths.length === 0) {
    throw new ApiError("BARCODE_PHOTO_REQUIRED");
  }
  if (photos.package_paths.length === 0) {
    throw new ApiError("PACKAGE_PHOTO_REQUIRED");
  }

  const db = await connectToDatabase();
  const normalized = normalizeTrackingNo(input.tracking_no);
  let inbound: any = null;
  if (input.inbound_id) {
    inbound = await db
      .collection(collections.INBOUND)
      .findOne({ _id: input.inbound_id as any });
  } else {
    inbound = await db.collection(collections.INBOUND).findOne({
      tracking_no_normalized: normalized,
      warehouseCode: ctx.warehouseCode,
    });
  }
  if (!inbound) {
    // surface to UI so it can offer "register as unclaimed"
    return { matched: false as const };
  }

  if (inbound.status === "cancelled") throw new ApiError("INBOUND_CANCELLED");
  if (inbound.status === "abandoned") throw new ApiError("INBOUND_ABANDONED");
  if (inbound.status !== "pending") {
    throw new ApiError("INVALID_STATUS_FOR_ARRIVE");
  }

  const scan_id = await nextDailyId("S");
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      await db.collection(collections.INBOUND_SCAN).insertOne(
        {
          _id: scan_id as any,
          inbound_request_id: inbound._id,
          unclaimed_inbound_id: null,
          client_id: inbound.client_id,
          type: "arrive",
          locationCode: null,
          weight: input.weight ?? null,
          dimension: input.dimension ?? null,
          photo_paths: [...photos.barcode_paths, ...photos.package_paths],
          photo_metadata: photos.metadata,
          anomalies: buildAnomaliesPayload(input.anomalies),
          operator_staff_id: ctx.staff_id,
          is_combined_arrive: false,
          staff_note: input.staff_note ?? null,
          cancelled_at: null,
          cancelled_reason: null,
          createdAt: now,
        } as any,
        { session }
      );

      await db.collection(collections.INBOUND).updateOne(
        { _id: inbound._id, status: "pending" },
        {
          $set: {
            status: "arrived",
            arrivedAt: now,
            last_scan_id: scan_id,
            last_scan_at: now,
            ...(input.weight ? { actualWeight: input.weight } : {}),
            ...(input.dimension ? { actualDimension: input.dimension } : {}),
            updatedAt: now,
          },
        },
        { session }
      );

      await createNotification({
        client_id: inbound.client_id,
        type: "inbound_arrived",
        title: "貨物已到倉",
        body: `您的貨 ${inbound._id} 已到倉，等待上架`,
        reference_type: "inbound",
        reference_id: String(inbound._id),
        action_url: `/zh-hk/inbound/${inbound._id}`,
      });

      if (input.anomalies.length > 0) {
        await createNotification({
          client_id: inbound.client_id,
          type: "inbound_anomaly_detected",
          title: "貨物異常通知",
          body: `貨物 ${inbound._id} 到倉時發現異常：${input.anomalies
            .map((a) => a.code)
            .join(", ")}`,
          reference_type: "inbound",
          reference_id: String(inbound._id),
          action_url: `/zh-hk/inbound/${inbound._id}`,
        });
      }
    });
  } finally {
    await session.endSession();
  }

  await logAudit({
    action: AUDIT_ACTIONS.inbound_arrived,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: inbound._id,
    details: {
      scan_id,
      anomaly_count: input.anomalies.length,
      weight: input.weight ?? null,
    },
    warehouse_code: ctx.warehouseCode,
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  if (input.anomalies.length > 0) {
    await logAudit({
      action: AUDIT_ACTIONS.inbound_anomaly_detected,
      actor_type: AUDIT_ACTOR_TYPES.wms_staff,
      actor_id: ctx.staff_id,
      target_type: AUDIT_TARGET_TYPES.inbound,
      target_id: inbound._id,
      details: { anomalies: input.anomalies.map((a) => a.code) },
      warehouse_code: ctx.warehouseCode,
    });
  }

  return {
    matched: true as const,
    scan_id,
    inbound_id: inbound._id,
    status: "arrived" as const,
  };
}

export async function cancelArrive(scan_id: string, ctx: StaffContext) {
  const db = await connectToDatabase();
  const scan = await db
    .collection(collections.INBOUND_SCAN)
    .findOne({ _id: scan_id as any });
  if (!scan) throw new ApiError("INBOUND_NOT_FOUND");
  if (scan.type !== "arrive") {
    throw new ApiError("INVALID_STATUS_FOR_ARRIVE");
  }
  if (scan.cancelled_at) {
    throw new ApiError("INVALID_STATUS_FOR_ARRIVE");
  }
  if (scan.operator_staff_id !== ctx.staff_id) {
    throw new ApiError("FORBIDDEN");
  }
  const age = Date.now() - new Date(scan.createdAt).getTime();
  if (age > UNDO_WINDOW_MS) throw new ApiError("UNDO_WINDOW_EXPIRED");

  const inbound = await db
    .collection(collections.INBOUND)
    .findOne({ _id: scan.inbound_request_id });
  if (!inbound) throw new ApiError("INBOUND_NOT_FOUND");
  if (inbound.status !== "arrived") {
    throw new ApiError("CANNOT_UNDO_RECEIVED");
  }

  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.INBOUND_SCAN).updateOne(
        { _id: scan_id as any },
        {
          $set: {
            cancelled_at: new Date(),
            cancelled_reason: "staff_undo",
          },
        },
        { session }
      );
      await db.collection(collections.INBOUND).updateOne(
        { _id: inbound._id, status: "arrived" },
        {
          $set: {
            status: "pending",
            arrivedAt: null,
            updatedAt: new Date(),
          },
          $unset: { last_scan_id: "", last_scan_at: "" },
        },
        { session }
      );
      await createNotification({
        client_id: inbound.client_id,
        type: "inbound_arrive_cancelled",
        title: "到貨登記已撤回",
        body: `先前到貨登記 ${scan_id} 已撤回`,
        reference_type: "inbound",
        reference_id: String(inbound._id),
      });
    });
  } finally {
    await session.endSession();
  }

  // unlink photos (best effort)
  await unlinkPhotos(scan.photo_paths ?? []);

  await logAudit({
    action: AUDIT_ACTIONS.inbound_arrive_cancelled,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: String(inbound._id),
    details: { scan_id },
    warehouse_code: ctx.warehouseCode,
  });

  return { success: true, scan_id, inbound_id: inbound._id };
}

// ── receive ─────────────────────────────────────────────────

const HANDLING_FEE = parseInt(process.env.HANDLING_FEE_PER_PACKAGE || "5", 10);

export async function performReceive(
  raw: unknown,
  ctx: StaffContext,
  photos: {
    barcode_paths: string[];
    package_paths: string[];
    metadata: { type: "barcode" | "package" | "anomaly"; size: number; mime: string }[];
  }
) {
  const input = ReceiveInputSchema.parse(raw);

  const db = await connectToDatabase();
  await getLocation(ctx.warehouseCode, input.locationCode);

  const inbound = await db
    .collection(collections.INBOUND)
    .findOne({ _id: input.inbound_id as any });
  if (!inbound) throw new ApiError("INBOUND_NOT_FOUND");
  if (inbound.status === "cancelled") throw new ApiError("INBOUND_CANCELLED");
  if (inbound.status === "abandoned") throw new ApiError("INBOUND_ABANDONED");
  if (inbound.status === "received") throw new ApiError("ALREADY_RECEIVED");
  if (inbound.status !== "pending" && inbound.status !== "arrived") {
    throw new ApiError("INVALID_STATUS_FOR_ARRIVE");
  }

  const is_combined_arrive = inbound.status === "pending";
  if (is_combined_arrive) {
    // 直走模式 — photos + weight + dimension are mandatory
    if (photos.barcode_paths.length === 0)
      throw new ApiError("BARCODE_PHOTO_REQUIRED");
    if (photos.package_paths.length === 0)
      throw new ApiError("PACKAGE_PHOTO_REQUIRED");
  }

  const scan_id = await nextDailyId("S");
  const session = getMongoClient().startSession();
  let charged_amount = 0;
  let balance_after = 0;

  try {
    await session.withTransaction(async () => {
      const now = new Date();

      await db.collection(collections.INBOUND_SCAN).insertOne(
        {
          _id: scan_id as any,
          inbound_request_id: inbound._id,
          unclaimed_inbound_id: null,
          client_id: inbound.client_id,
          type: "receive",
          locationCode: input.locationCode,
          weight: input.weight ?? inbound.actualWeight ?? null,
          dimension: input.dimension ?? inbound.actualDimension ?? null,
          photo_paths: [...photos.barcode_paths, ...photos.package_paths],
          photo_metadata: photos.metadata,
          anomalies: buildAnomaliesPayload(input.anomalies),
          operator_staff_id: ctx.staff_id,
          is_combined_arrive,
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
            ...(is_combined_arrive ? { arrivedAt: now } : {}),
            ...(input.weight ? { actualWeight: input.weight } : {}),
            ...(input.dimension ? { actualDimension: input.dimension } : {}),
            last_scan_id: scan_id,
            last_scan_at: now,
            updatedAt: now,
          },
        },
        { session }
      );

      // walletService.charge is itself transactional but uses its own
      // session — call it after the inbound update so we don't nest
      // sessions. Errors from charge will throw and the upper transaction
      // commits anyway; we accept this trade-off because the charge writes
      // its own audit row.
    });
    // Charge outside the session so its $inc isn't fighting our outer
    // transaction. walletService internally opens its own session.
    const result = await walletService.charge({
      client_id: inbound.client_id,
      amount: HANDLING_FEE,
      reference_type: "inbound",
      reference_id: String(inbound._id),
      customer_note: `處理費 HK$${HANDLING_FEE}`,
    });
    charged_amount = HANDLING_FEE;
    balance_after = result.balance_after;
  } finally {
    await session.endSession();
  }

  await createNotification({
    client_id: inbound.client_id,
    type: "inbound_received",
    title: "貨物已上架",
    body: `您的貨 ${inbound._id} 已上架，扣處理費 HK$${HANDLING_FEE}，餘額 HK$${balance_after}`,
    reference_type: "inbound",
    reference_id: String(inbound._id),
    action_url: `/zh-hk/inbound/${inbound._id}`,
  });

  if (input.anomalies.length > 0) {
    await createNotification({
      client_id: inbound.client_id,
      type: "inbound_anomaly_detected",
      title: "貨物異常通知",
      body: `貨物 ${inbound._id} 上架時發現異常：${input.anomalies
        .map((a) => a.code)
        .join(", ")}`,
      reference_type: "inbound",
      reference_id: String(inbound._id),
    });
  }

  // single 模式 placeholder (Marco's pivot): we mark a held outbound so
  // P7/P8 can pick it up later. Real autoCreateForSingle ships in P7.
  let single_held = false;
  if (inbound.shipment_type === "single") {
    // No-op for now; P5 spec §5.7 already calls for a fail-soft. The
    // outbound creation lives in P7 — we leave a notification breadcrumb
    // so dev can verify the trigger fires.
    single_held = true;
    await createNotification({
      client_id: inbound.client_id,
      type: "outbound_held_insufficient_balance",
      title: "Single 出庫單暫存",
      body: `您選擇單一寄送的貨物 ${inbound._id} 已上架，出庫流程於 Phase 7 啟用後自動處理`,
      reference_type: "inbound",
      reference_id: String(inbound._id),
    });
  }

  await logAudit({
    action: AUDIT_ACTIONS.inbound_received,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: String(inbound._id),
    details: {
      scan_id,
      locationCode: input.locationCode,
      is_combined_arrive,
      charged: charged_amount,
      balance_after,
      single_held,
    },
    warehouse_code: ctx.warehouseCode,
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return {
    success: true,
    scan_id,
    inbound_id: inbound._id,
    is_combined_arrive,
    charged: charged_amount,
    balance_after,
    single_held,
  };
}

// ── unclaimed register ─────────────────────────────────────

export async function registerUnclaimed(
  raw: unknown,
  ctx: StaffContext,
  photos: {
    paths: string[];
    metadata: { type: "barcode" | "package" | "anomaly"; size: number; mime: string }[];
  }
) {
  const input = UnclaimedRegisterSchema.parse(raw);
  if (photos.paths.length === 0) {
    throw new ApiError("BARCODE_PHOTO_REQUIRED");
  }

  const db = await connectToDatabase();
  const normalized = normalizeTrackingNo(input.tracking_no);

  // Dedupe: same tracking, status pending_assignment
  const dup = await db.collection(collections.UNCLAIMED_INBOUND).findOne({
    tracking_no_normalized: normalized,
    status: "pending_assignment",
  });
  if (dup) throw new ApiError("UNCLAIMED_DUPLICATED");

  const unclaimed_id = await nextDailyId("U");
  const scan_id = await nextDailyId("S");
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      await db.collection(collections.UNCLAIMED_INBOUND).insertOne(
        {
          _id: unclaimed_id as any,
          warehouseCode: ctx.warehouseCode,
          carrier_inbound_code: input.carrier_inbound_code,
          tracking_no: input.tracking_no,
          tracking_no_normalized: normalized,
          weight: input.weight,
          dimension: input.dimension,
          photo_paths: photos.paths,
          staff_note: input.staff_note,
          status: "pending_assignment",
          assigned_to_client_id: null,
          assigned_to_inbound_id: null,
          assigned_at: null,
          assigned_by_staff_id: null,
          disposed_at: null,
          disposed_reason: null,
          arrived_at: now,
          arrived_by_staff_id: ctx.staff_id,
          createdAt: now,
          updatedAt: now,
        } as any,
        { session }
      );
      await db.collection(collections.INBOUND_SCAN).insertOne(
        {
          _id: scan_id as any,
          inbound_request_id: null,
          unclaimed_inbound_id: unclaimed_id,
          client_id: null,
          type: "unclaimed_arrive",
          locationCode: null,
          weight: input.weight,
          dimension: input.dimension,
          photo_paths: photos.paths,
          photo_metadata: photos.metadata,
          anomalies: [],
          operator_staff_id: ctx.staff_id,
          is_combined_arrive: false,
          staff_note: input.staff_note,
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
    action: AUDIT_ACTIONS.unclaimed_arrived,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.unclaimed_inbound,
    target_id: unclaimed_id,
    details: {
      scan_id,
      tracking_no: input.tracking_no,
      carrier_inbound_code: input.carrier_inbound_code,
      weight: input.weight,
    },
    warehouse_code: ctx.warehouseCode,
  });

  return { success: true, unclaimed_id, scan_id };
}

// ── read helpers ───────────────────────────────────────────

export async function listInboundScans(filter: {
  inbound_id?: string;
  operator_staff_id?: string;
  type?: string;
  page?: number;
  page_size?: number;
}) {
  const db = await connectToDatabase();
  const f: Record<string, unknown> = {};
  if (filter.inbound_id) f.inbound_request_id = filter.inbound_id;
  if (filter.operator_staff_id) f.operator_staff_id = filter.operator_staff_id;
  if (filter.type) f.type = filter.type;
  const page = filter.page ?? 1;
  const page_size = Math.min(filter.page_size ?? 50, 200);
  const total = await db
    .collection(collections.INBOUND_SCAN)
    .countDocuments(f);
  const docs = await db
    .collection(collections.INBOUND_SCAN)
    .find(f)
    .sort({ createdAt: -1 })
    .skip((page - 1) * page_size)
    .limit(page_size)
    .toArray();
  return {
    items: docs.map(projectScan),
    total,
    page,
    page_size,
  };
}

export async function listInboundScansForInbound(inbound_id: string) {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.INBOUND_SCAN)
    .find({ inbound_request_id: inbound_id })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map(projectScan);
}

export async function listAbandonedInbounds() {
  const db = await connectToDatabase();
  const handledIds = (
    await db
      .collection(collections.STAFF_HANDLED_ABANDONED)
      .find({})
      .toArray()
  ).map((d: any) => d.inbound_request_id);
  const docs = await db
    .collection(collections.INBOUND)
    .find({ status: "abandoned", _id: { $nin: handledIds as any } })
    .sort({ abandoned_at: -1 })
    .limit(200)
    .toArray();
  return docs.map((d: any) => ({
    _id: d._id,
    client_id: d.client_id,
    tracking_no: d.tracking_no,
    abandoned_at: d.abandoned_at,
    abandoned_reason: d.abandoned_reason,
    last_scan_at: d.last_scan_at,
  }));
}

export async function markAbandonedHandled(
  inbound_id: string,
  note: string | null,
  ctx: StaffContext
) {
  const db = await connectToDatabase();
  await db.collection(collections.STAFF_HANDLED_ABANDONED).updateOne(
    { inbound_request_id: inbound_id },
    {
      $setOnInsert: {
        inbound_request_id: inbound_id,
        staff_id: ctx.staff_id,
        note: note ?? null,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
  await db.collection(collections.INBOUND).updateOne(
    { _id: inbound_id as any },
    {
      $set: {
        staff_handled_abandoned_at: new Date(),
        staff_handled_abandoned_note: note ?? null,
        updatedAt: new Date(),
      },
    }
  );
  await logAudit({
    action: AUDIT_ACTIONS.staff_abandoned_handled,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: inbound_id,
    details: { note },
    warehouse_code: ctx.warehouseCode,
  });
  return { success: true };
}

export async function listUnclaimed(status?: "pending_assignment" | "assigned" | "disposed") {
  const db = await connectToDatabase();
  const f: any = {};
  if (status) f.status = status;
  const docs = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .find(f)
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  return docs.map(projectUnclaimed);
}

export async function getUnclaimed(id: string) {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .findOne({ _id: id as any });
  if (!doc) throw new ApiError("INBOUND_NOT_FOUND");
  return projectUnclaimed(doc);
}

// ── admin adjust receive ───────────────────────────────────

export const AdminAdjustInputSchema = z
  .object({
    new_status: z.enum(["pending", "arrived", "received"]),
    refund: z.boolean().default(false),
    reason: z.string().min(1).max(500),
  })
  .strict();

export async function adminAdjustInbound(
  inbound_id: string,
  raw: unknown,
  ctx: StaffContext
) {
  const input = AdminAdjustInputSchema.parse(raw);
  const db = await connectToDatabase();
  const inbound = await db
    .collection(collections.INBOUND)
    .findOne({ _id: inbound_id as any });
  if (!inbound) throw new ApiError("INBOUND_NOT_FOUND");
  if (["picking", "packed", "palletized", "departed"].includes(inbound.status)) {
    throw new ApiError("INVALID_STATUS_FOR_ARRIVE");
  }

  const update: Record<string, unknown> = {
    status: input.new_status,
    updatedAt: new Date(),
  };
  if (input.new_status === "pending") {
    update.arrivedAt = null;
    update.receivedAt = null;
  } else if (input.new_status === "arrived") {
    update.receivedAt = null;
    if (!inbound.arrivedAt) update.arrivedAt = new Date();
  }

  await db
    .collection(collections.INBOUND)
    .updateOne({ _id: inbound_id as any }, { $set: update });

  if (input.new_status !== "received" && inbound.status === "received") {
    // remove from item_locations (mark reverted)
    await db
      .collection(collections.ITEM_LOCATION)
      .updateOne(
        { itemCode: inbound_id },
        { $set: { currentStatus: "reverted", updatedAt: new Date() } }
      );
  }

  if (input.refund && inbound.status === "received") {
    // Use adjustment (not refund) — refund is scoped to unclaimed /
    // label_failed reference types per Phase 3 spec. Admin-driven receive
    // reversal lives in the manual-adjustment lane.
    await walletService.adjustment({
      client_id: inbound.client_id,
      amount: HANDLING_FEE,
      operator_staff_id: ctx.staff_id,
      customer_note: `Admin 調整退費：${input.reason}`,
      internal_note: `Reverted receive of ${inbound_id}`,
    });
  }

  await createNotification({
    client_id: inbound.client_id,
    type: "inbound_status_adjusted",
    title: "貨物狀態調整",
    body: `您的貨 ${inbound_id} 狀態被人工調整為 ${input.new_status}：${input.reason}`,
    reference_type: "inbound",
    reference_id: inbound_id,
  });

  await logAudit({
    action: AUDIT_ACTIONS.inbound_status_adjusted,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: inbound_id,
    details: {
      from: inbound.status,
      to: input.new_status,
      refund: input.refund,
      reason: input.reason,
    },
    warehouse_code: ctx.warehouseCode,
  });

  return { success: true };
}

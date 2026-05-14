// Phase 10 — pick batch (wave) service.
//
// A pick_batch groups multiple outbound_requests into a single picking
// wave. Staff create it from desktop ("today's outbounds"), start it
// (locks the outbound list), then PDA staff use location-centric pick
// queries against the active batch. When all outbounds in the batch
// reach status=picked, batch auto-advances to picked; staff close it
// to release pick stations.

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
  PickBatchPublic,
  PickBatchStatus,
  ShelfPickItem,
  ShelfPickResponse,
  projectPickBatch,
} from "@/types/PickBatch";

export interface StaffCtx {
  staff_id: string;
  warehouseCode: string;
  ip_address?: string;
  user_agent?: string;
}

// ── helpers ──────────────────────────────────────────────────

async function getBatch(db: any, batch_id: string) {
  const doc = await db
    .collection(collections.PICK_BATCH)
    .findOne({ _id: batch_id as any });
  if (!doc) throw new ApiError("PICK_BATCH_NOT_FOUND", { batchId: batch_id });
  return doc;
}

function ensureStatus(
  doc: any,
  allowed: PickBatchStatus[],
  ctx?: { batchId?: string }
) {
  if (!allowed.includes(doc.status)) {
    throw new ApiError("PICK_BATCH_INVALID_STATUS", {
      status: doc.status,
      batchId: ctx?.batchId ?? String(doc._id),
    });
  }
}

// ── create ───────────────────────────────────────────────────

export interface CreateBatchInput {
  warehouseCode: string;
  outbound_ids: string[];
  note?: string | null;
}

export async function createBatch(
  ctx: StaffCtx,
  input: CreateBatchInput
): Promise<PickBatchPublic> {
  if (input.outbound_ids.length === 0) {
    throw new ApiError("PICK_BATCH_EMPTY");
  }
  const db = await connectToDatabase();

  // All outbounds must be in ready_for_label and not in another active batch.
  const outbounds = await db
    .collection(collections.OUTBOUND)
    .find({ _id: { $in: input.outbound_ids as any } })
    .toArray();
  const byId = new Map(outbounds.map((o: any) => [String(o._id), o]));
  for (const oid of input.outbound_ids) {
    const o: any = byId.get(oid);
    if (!o) {
      throw new ApiError("OUTBOUND_NOT_BATCHABLE", {
        outboundId: oid,
        status: "not_found",
      });
    }
    if (o.status !== "ready_for_label") {
      throw new ApiError("OUTBOUND_NOT_BATCHABLE", {
        outboundId: oid,
        status: o.status,
      });
    }
    if (o.batch_id) {
      throw new ApiError("OUTBOUND_ALREADY_IN_BATCH", {
        outboundId: oid,
        batchId: o.batch_id,
      });
    }
  }

  const _id = await nextDailyId("PB");
  const now = new Date();
  // Marco's flow update (2026-05-14): no separate draft state. Creating a
  // batch immediately puts it into picking and stamps batch_id on the
  // member outbounds — the warehouse can print the sheet and start picking
  // straight from the list page, no detail page detour.
  const doc = {
    _id: _id as any,
    batch_no: _id,
    warehouseCode: input.warehouseCode,
    status: "picking" as PickBatchStatus,
    outbound_ids: input.outbound_ids,
    note: input.note ?? null,
    created_by_staff_id: ctx.staff_id,
    started_at: now,
    started_by_staff_id: ctx.staff_id,
    picked_at: null,
    closed_at: null,
    closed_by_staff_id: null,
    cancelled_at: null,
    cancel_reason: null,
    createdAt: now,
    updatedAt: now,
  };
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db
        .collection(collections.PICK_BATCH)
        .insertOne(doc as any, { session });
      await db.collection(collections.OUTBOUND).updateMany(
        {
          _id: { $in: input.outbound_ids as any },
          status: "ready_for_label",
        },
        { $set: { batch_id: _id, updatedAt: now } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
  await logAudit({
    action: AUDIT_ACTIONS.pick_batch_created,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.pick_batch,
    target_id: _id,
    details: {
      outbound_count: input.outbound_ids.length,
      warehouseCode: input.warehouseCode,
    },
    warehouse_code: ctx.warehouseCode,
  });
  await logAudit({
    action: AUDIT_ACTIONS.pick_batch_started,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.pick_batch,
    target_id: _id,
    details: { outbound_count: input.outbound_ids.length },
    warehouse_code: ctx.warehouseCode,
  });
  return projectPickBatch(doc);
}

// ── start (lock outbounds) ───────────────────────────────────

export async function startBatch(
  ctx: StaffCtx,
  batch_id: string
): Promise<PickBatchPublic> {
  const db = await connectToDatabase();
  const batch = await getBatch(db, batch_id);
  ensureStatus(batch, ["draft"], { batchId: batch_id });

  const now = new Date();
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.PICK_BATCH).updateOne(
        { _id: batch_id as any, status: "draft" },
        {
          $set: {
            status: "picking",
            started_at: now,
            started_by_staff_id: ctx.staff_id,
            updatedAt: now,
          },
        },
        { session }
      );
      // Stamp batch_id on member outbounds so pickInbound + UI can find them.
      await db.collection(collections.OUTBOUND).updateMany(
        {
          _id: { $in: batch.outbound_ids as any },
          status: "ready_for_label",
        },
        { $set: { batch_id, updatedAt: now } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await logAudit({
    action: AUDIT_ACTIONS.pick_batch_started,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.pick_batch,
    target_id: batch_id,
    details: { outbound_count: batch.outbound_ids.length },
    warehouse_code: ctx.warehouseCode,
  });

  const after = await getBatch(db, batch_id);
  return projectPickBatch(after);
}

// ── add / remove outbound (only while draft) ─────────────────

export async function addOutboundToBatch(
  ctx: StaffCtx,
  batch_id: string,
  outbound_id: string
): Promise<PickBatchPublic> {
  const db = await connectToDatabase();
  const batch = await getBatch(db, batch_id);
  ensureStatus(batch, ["draft"], { batchId: batch_id });

  if (batch.outbound_ids.includes(outbound_id)) {
    throw new ApiError("OUTBOUND_ALREADY_IN_BATCH", {
      outboundId: outbound_id,
      batchId: batch_id,
    });
  }
  const ob = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  if (!ob || ob.status !== "ready_for_label") {
    throw new ApiError("OUTBOUND_NOT_BATCHABLE", {
      outboundId: outbound_id,
      status: ob?.status ?? "not_found",
    });
  }
  if (ob.batch_id) {
    throw new ApiError("OUTBOUND_ALREADY_IN_BATCH", {
      outboundId: outbound_id,
      batchId: ob.batch_id,
    });
  }
  await db.collection(collections.PICK_BATCH).updateOne(
    { _id: batch_id as any, status: "draft" },
    {
      $push: { outbound_ids: outbound_id } as any,
      $set: { updatedAt: new Date() },
    }
  );
  await logAudit({
    action: AUDIT_ACTIONS.pick_batch_outbound_added,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.pick_batch,
    target_id: batch_id,
    details: { outbound_id },
    warehouse_code: ctx.warehouseCode,
  });
  const after = await getBatch(db, batch_id);
  return projectPickBatch(after);
}

export async function removeOutboundFromBatch(
  ctx: StaffCtx,
  batch_id: string,
  outbound_id: string
): Promise<PickBatchPublic> {
  const db = await connectToDatabase();
  const batch = await getBatch(db, batch_id);
  ensureStatus(batch, ["draft"], { batchId: batch_id });

  await db.collection(collections.PICK_BATCH).updateOne(
    { _id: batch_id as any, status: "draft" },
    {
      $pull: { outbound_ids: outbound_id } as any,
      $set: { updatedAt: new Date() },
    }
  );
  await logAudit({
    action: AUDIT_ACTIONS.pick_batch_outbound_removed,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.pick_batch,
    target_id: batch_id,
    details: { outbound_id },
    warehouse_code: ctx.warehouseCode,
  });
  const after = await getBatch(db, batch_id);
  return projectPickBatch(after);
}

// ── batch auto-advance + close ───────────────────────────────

/**
 * Called by wmsFlow after an outbound transitions to status=picked.
 * Checks if every outbound in the batch is now picked; if so flips
 * batch.status to "picked" (does NOT close — staff explicitly closes).
 */
export async function checkBatchPickComplete(
  outbound_id: string
): Promise<void> {
  const db = await connectToDatabase();
  const ob = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  if (!ob?.batch_id) return;
  const batch = await db
    .collection(collections.PICK_BATCH)
    .findOne({ _id: ob.batch_id as any });
  if (!batch || batch.status !== "picking") return;
  // Count outbounds still not at "picked" or beyond.
  const remaining = await db
    .collection(collections.OUTBOUND)
    .countDocuments({
      _id: { $in: batch.outbound_ids as any },
      status: { $in: ["ready_for_label", "picking"] },
    });
  if (remaining === 0) {
    await db.collection(collections.PICK_BATCH).updateOne(
      { _id: ob.batch_id as any, status: "picking" },
      {
        $set: {
          status: "picked",
          picked_at: new Date(),
          updatedAt: new Date(),
        },
      }
    );
    await logAudit({
      action: AUDIT_ACTIONS.pick_batch_picked,
      actor_type: AUDIT_ACTOR_TYPES.system,
      actor_id: null,
      target_type: AUDIT_TARGET_TYPES.pick_batch,
      target_id: ob.batch_id,
      details: { outbound_count: batch.outbound_ids.length },
    });
  }
}

export async function closeBatch(
  ctx: StaffCtx,
  batch_id: string
): Promise<PickBatchPublic> {
  const db = await connectToDatabase();
  const batch = await getBatch(db, batch_id);
  ensureStatus(batch, ["picked", "picking"], { batchId: batch_id });

  const now = new Date();
  await db.collection(collections.PICK_BATCH).updateOne(
    { _id: batch_id as any, status: { $in: ["picked", "picking"] } },
    {
      $set: {
        status: "closed",
        closed_at: now,
        closed_by_staff_id: ctx.staff_id,
        updatedAt: now,
      },
    }
  );
  await logAudit({
    action: AUDIT_ACTIONS.pick_batch_closed,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.pick_batch,
    target_id: batch_id,
    details: {},
    warehouse_code: ctx.warehouseCode,
  });
  const after = await getBatch(db, batch_id);
  return projectPickBatch(after);
}

export async function cancelBatch(
  ctx: StaffCtx,
  batch_id: string,
  reason: string
): Promise<PickBatchPublic> {
  const db = await connectToDatabase();
  const batch = await getBatch(db, batch_id);
  ensureStatus(batch, ["draft", "picking"], { batchId: batch_id });

  const now = new Date();
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.PICK_BATCH).updateOne(
        { _id: batch_id as any },
        {
          $set: {
            status: "cancelled",
            cancelled_at: now,
            cancel_reason: reason,
            updatedAt: now,
          },
        },
        { session }
      );
      // Detach batch_id from member outbounds so they can be re-batched.
      // Only ones still in ready_for_label / picking are detached; picked+
      // outbounds keep batch_id for historical reference.
      await db.collection(collections.OUTBOUND).updateMany(
        {
          _id: { $in: batch.outbound_ids as any },
          status: { $in: ["ready_for_label", "picking"] },
          batch_id,
        },
        { $set: { batch_id: null, updatedAt: now } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
  await logAudit({
    action: AUDIT_ACTIONS.pick_batch_cancelled,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.pick_batch,
    target_id: batch_id,
    details: { reason },
    warehouse_code: ctx.warehouseCode,
  });
  const after = await getBatch(db, batch_id);
  return projectPickBatch(after);
}

// ── list / detail ────────────────────────────────────────────

export async function listBatches(params: {
  warehouseCode?: string;
  status?: PickBatchStatus[];
  limit?: number;
}): Promise<PickBatchPublic[]> {
  const db = await connectToDatabase();
  const filter: Record<string, any> = {};
  if (params.warehouseCode) filter.warehouseCode = params.warehouseCode;
  if (params.status && params.status.length > 0)
    filter.status = { $in: params.status };
  const docs = await db
    .collection(collections.PICK_BATCH)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(params.limit ?? 50, 200))
    .toArray();
  return docs.map(projectPickBatch);
}

export interface BatchDetail extends PickBatchPublic {
  outbounds: Array<{
    _id: string;
    client_id: string;
    client_code: string | null;
    status: string;
    inbound_count: number;
    carrier_code: string;
    destination_country: string;
  }>;
  progress: {
    total_inbounds: number;
    picked_inbounds: number;
  };
}

export async function getBatchDetail(batch_id: string): Promise<BatchDetail> {
  const db = await connectToDatabase();
  const batch = await getBatch(db, batch_id);
  const outbounds = await db
    .collection(collections.OUTBOUND)
    .find({ _id: { $in: batch.outbound_ids as any } })
    .project({
      client_id: 1,
      status: 1,
      inbound_count: 1,
      carrier_code: 1,
      destination_country: 1,
    })
    .toArray();
  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({ outbound_id: { $in: batch.outbound_ids }, unlinked_at: null })
    .toArray();
  const total_inbounds = links.length;
  const inboundIds = links.map((l: any) => l.inbound_id);
  const picked = inboundIds.length
    ? await db.collection(collections.INBOUND).countDocuments({
        _id: { $in: inboundIds as any },
        status: { $in: ["picking", "packed", "departed"] },
      })
    : 0;
  // SIA code join for display.
  const { getClientCodeMap } = await import("@/services/clients/code_lookup");
  const codeMap = await getClientCodeMap(
    outbounds.map((o: any) => o.client_id)
  );
  return {
    ...projectPickBatch(batch),
    outbounds: outbounds.map((o: any) => ({
      _id: String(o._id),
      client_id: o.client_id,
      client_code: codeMap.get(String(o.client_id)) ?? null,
      status: o.status,
      inbound_count: o.inbound_count ?? 0,
      carrier_code: o.carrier_code,
      destination_country: o.destination_country,
    })),
    progress: { total_inbounds, picked_inbounds: picked },
  };
}

// ── shelf-scan pick list (PDA core query) ────────────────────

/**
 * Returns the list of inbound items sitting on a given shelf that
 * still need to be picked for the active batch. Items are augmented
 * with a thumbnail path drawn from the most recent inbound_scan
 * (package photo preferred, barcode photo as fallback).
 *
 * If no active batch_id is supplied, picks the first warehouse-active
 * batch (status=picking) — convenient for PDA where staff is in one
 * wave at a time.
 */
export async function listByLocation(params: {
  warehouseCode: string;
  locationCode: string;
  batchId?: string;
}): Promise<ShelfPickResponse> {
  const db = await connectToDatabase();

  // Resolve active batch.
  //   - No batchId → auto-pick the warehouse's current picking batch.
  //   - Explicit batchId → allow draft+picking so the print preview / pick-
  //     sheet flow can run before the operator clicks 開始批次.
  let batchId = params.batchId;
  if (!batchId) {
    const active = await db
      .collection(collections.PICK_BATCH)
      .findOne(
        { warehouseCode: params.warehouseCode, status: "picking" },
        { sort: { started_at: 1 } as any }
      );
    if (!active) {
      throw new ApiError("PICK_BATCH_NOT_ACTIVE", { batchId: "(none)" });
    }
    batchId = String(active._id);
  } else {
    const batch = await getBatch(db, batchId);
    ensureStatus(batch, ["draft", "picking"], { batchId });
  }

  const batch = await getBatch(db, batchId);
  const outboundIds: string[] = batch.outbound_ids ?? [];
  if (outboundIds.length === 0) {
    return {
      locationCode: params.locationCode,
      batch_id: batchId!,
      total_items: 0,
      pending_items: 0,
      client_count: 0,
      items: [],
    };
  }

  // Inbounds in this batch.
  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({ outbound_id: { $in: outboundIds }, unlinked_at: null })
    .toArray();
  const inboundIds = links.map((l: any) => l.inbound_id);
  if (inboundIds.length === 0) {
    return {
      locationCode: params.locationCode,
      batch_id: batchId!,
      total_items: 0,
      pending_items: 0,
      client_count: 0,
      items: [],
    };
  }

  // Filter by location: item_locations is the source of truth for "where
  // is this inbound parked right now".
  const itemLocs = await db
    .collection(collections.ITEM_LOCATION)
    .find({
      itemCode: { $in: inboundIds },
      locationCode: params.locationCode,
    })
    .toArray();
  const locInboundIds = itemLocs.map((l: any) => l.itemCode);
  if (locInboundIds.length === 0) {
    return {
      locationCode: params.locationCode,
      batch_id: batchId!,
      total_items: 0,
      pending_items: 0,
      client_count: 0,
      items: [],
    };
  }

  // Pull inbound master + outbound_id mapping.
  const inbounds = await db
    .collection(collections.INBOUND)
    .find({ _id: { $in: locInboundIds as any } })
    .toArray();
  const outboundByInbound = new Map<string, string>(
    links.map((l: any) => [l.inbound_id, l.outbound_id])
  );

  // Pull most recent scan per inbound for thumbnail.
  const scans = await db
    .collection(collections.INBOUND_SCAN)
    .find({ inbound_id: { $in: locInboundIds as any } })
    .sort({ createdAt: -1 })
    .toArray();
  const thumbByInbound = new Map<string, string | null>();
  for (const s of scans as any[]) {
    if (thumbByInbound.has(s.inbound_id)) continue;
    const pkg = s.photo_package_paths?.[0] ?? null;
    const barcode = s.photo_barcode_paths?.[0] ?? null;
    thumbByInbound.set(s.inbound_id, pkg ?? barcode ?? null);
  }

  // Aggregate product names from inbound_declared_items so picker sees
  // "Panasonic 麵包機 +3 件" instead of "no name".
  const declaredItems = await db
    .collection(collections.INBOUND_DECLARED_ITEM)
    .find({ inbound_request_id: { $in: locInboundIds } })
    .project({ inbound_request_id: 1, product_name: 1, display_order: 1 })
    .sort({ display_order: 1 })
    .toArray();
  const namesByInbound = new Map<string, string[]>();
  for (const di of declaredItems as any[]) {
    const arr = namesByInbound.get(di.inbound_request_id) ?? [];
    arr.push(di.product_name);
    namesByInbound.set(di.inbound_request_id, arr);
  }
  function summarizeNames(id: string): string | null {
    const names = namesByInbound.get(id);
    if (!names || names.length === 0) return null;
    const first = names[0];
    if (names.length === 1) return first;
    return `${first} +${names.length - 1} 件`;
  }

  // SIA client code lookup so PDA can show SIA0004 rather than the long hex.
  const { getClientCodeMap } = await import("@/services/clients/code_lookup");
  const codeMap = await getClientCodeMap(
    inbounds.map((i: any) => i.client_id)
  );

  const items: ShelfPickItem[] = inbounds.map((i: any) => {
    const clientId: string = i.client_id;
    const oid = outboundByInbound.get(String(i._id)) ?? "";
    return {
      inbound_id: String(i._id),
      tracking_no: i.tracking_no ?? "",
      client_id: clientId,
      client_short: clientId.length > 5 ? clientId.slice(-5) : clientId,
      client_code: codeMap.get(String(clientId)) ?? null,
      outbound_id: oid,
      outbound_short: oid.split("-").slice(-1)[0] || oid,
      declared_name: summarizeNames(String(i._id)),
      thumbnail_path: thumbByInbound.get(String(i._id)) ?? null,
      status: i.status === "received" ? "pending" : "picked",
      actualWeight: i.actualWeight ?? null,
    };
  });

  const pending = items.filter((it) => it.status === "pending");
  const clients = new Set(items.map((it) => it.client_id));
  return {
    locationCode: params.locationCode,
    batch_id: batchId!,
    total_items: items.length,
    pending_items: pending.length,
    client_count: clients.size,
    items,
  };
}

// ── shelf overview (PDA "where do I need to walk" view) ──────

export interface ShelfSummaryRow {
  locationCode: string;
  pending_count: number;
  total_count: number;
}

/**
 * Aggregate the inbound items in a batch by shelf so PDA can show a
 * "go to these shelves" overview before the operator scans a code.
 * pending = inbound.status still "received" (not yet pickInbound'd).
 */
export async function listShelvesForBatch(
  batch_id: string
): Promise<{ batch_id: string; shelves: ShelfSummaryRow[] }> {
  const db = await connectToDatabase();
  const batch = await getBatch(db, batch_id);
  const outboundIds: string[] = batch.outbound_ids ?? [];
  if (outboundIds.length === 0) {
    return { batch_id, shelves: [] };
  }

  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({ outbound_id: { $in: outboundIds }, unlinked_at: null })
    .toArray();
  const inboundIds = links.map((l: any) => l.inbound_id);
  if (inboundIds.length === 0) return { batch_id, shelves: [] };

  const itemLocs = await db
    .collection(collections.ITEM_LOCATION)
    .find({ itemCode: { $in: inboundIds } })
    .toArray();
  const locByInbound = new Map<string, string | null>(
    itemLocs.map((l: any) => [String(l.itemCode), l.locationCode ?? null])
  );

  const inbounds = await db
    .collection(collections.INBOUND)
    .find({ _id: { $in: inboundIds as any } })
    .project({ _id: 1, status: 1 })
    .toArray();

  // Group: locationCode -> { pending, total }
  const byLoc = new Map<string, { pending: number; total: number }>();
  for (const inb of inbounds as any[]) {
    const loc = locByInbound.get(String(inb._id)) ?? null;
    if (!loc) continue; // not yet shelved — ignore
    const row = byLoc.get(loc) ?? { pending: 0, total: 0 };
    row.total += 1;
    if (inb.status === "received") row.pending += 1;
    byLoc.set(loc, row);
  }
  const shelves: ShelfSummaryRow[] = Array.from(byLoc.entries())
    .map(([locationCode, v]) => ({
      locationCode,
      pending_count: v.pending,
      total_count: v.total,
    }))
    .sort((a, b) => a.locationCode.localeCompare(b.locationCode));
  return { batch_id, shelves };
}

export const pickBatchService = {
  createBatch,
  startBatch,
  addOutboundToBatch,
  removeOutboundFromBatch,
  checkBatchPickComplete,
  closeBatch,
  cancelBatch,
  listBatches,
  getBatchDetail,
  listByLocation,
  listShelvesForBatch,
};

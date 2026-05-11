// Phase 7 — OMS outbound creation service.
//
// Surfaces:
//   - Client:  createConsolidatedOutbound, createSingleOutbound, listMyOutbounds,
//              getMyOutbound, cancelMyOutbound, previewRateQuote
//   - System:  releaseHeldByBalance (called from walletService.onTopupApproved
//              when a topup tips a client's balance into "can pay"),
//              afterWeightVerified (called by P8 WMS once boxes are reweighed)
//   - Admin:   adminListOutbounds, adminGetOutbound, adminReleaseHeld
//
// State machine (per spec §1.5):
//   - On create: try rate_quote → if balance < quote.total, go to held(insufficient_balance)
//                                  else go to ready_for_label (auto) or pending_client_label
//                                  (confirm_before_label)
//   - On release-by-balance: held(insufficient_balance) → ready_for_label / pending_client_label
//                            using the *stored* quote (no re-quote)
//   - On client-cancel: held / ready_for_label / pending_client_label → cancelled
//                        (anything past picking is locked — WMS owns it)
//   - On weight-verified (P8): ready_for_label / pending_client_label → label_obtaining
//                                                                      → label_obtained
//
// Charging: balance is *not* debited on create (review.md §3.3). The actual
// charge happens at label-fetch time, atomically with the wallet write. The
// held state functions as a soft-reservation only.

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
import { nextDailyId } from "@/services/util/daily-counter";
import {
  rateQuoteWithLog,
  getCarrierAdapter,
} from "@/services/carrier/carrierAdapter";
import {
  CreateConsolidatedOutboundInput,
  CreateConsolidatedOutboundInputSchema,
  CreateSingleOutboundInput,
  CreateSingleOutboundInputSchema,
  OutboundHeldReason,
  OutboundRequestV1Public,
  OutboundStatusV1,
  RateQuoteBreakdown,
  RateQuotePreviewInput,
  RateQuotePreviewInputSchema,
  projectOutboundV1,
  projectOutboundV1Admin,
} from "@/types/OutboundV1";
import { ObjectId } from "mongodb";

export interface ClientContext {
  client_id: string;
  ip_address?: string;
  user_agent?: string;
}

export interface AdminContext {
  staff_id: string;
  ip_address?: string;
  user_agent?: string;
}

// ── tunables ─────────────────────────────────────────────────

// Statuses where client may still cancel (everything past picking is WMS).
const CLIENT_CANCELLABLE_STATUSES: OutboundStatusV1[] = [
  "held",
  "ready_for_label",
  "pending_client_label",
];

// Statuses we should never touch when releasing balance (already past gate).
const HELD_RELEASE_TARGET: OutboundStatusV1 = "held";

// Estimated weight when client hasn't given a real number yet. v1 keeps it
// simple — refined post-launch when real warehouse data arrives.
const DEFAULT_ESTIMATE_WEIGHT_KG = 2;

// ── helpers ──────────────────────────────────────────────────

async function lookupCarrier(db: any, carrier_code: string) {
  const c = await db
    .collection(collections.CARRIER)
    .findOne({ carrier_code, status: "active" });
  if (!c) throw new ApiError("CARRIER_NOT_ENABLED", { code: carrier_code });
  return c;
}

async function lookupClientCarrierAccount(
  db: any,
  client_id: string,
  account_id: string
) {
  let oid: ObjectId;
  try {
    oid = new ObjectId(account_id);
  } catch {
    throw new ApiError("INVALID_CARRIER_ACCOUNT");
  }
  const a = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .findOne({ _id: oid, client_id, status: "active", deleted_at: null });
  if (!a) throw new ApiError("INVALID_CARRIER_ACCOUNT");
  return a;
}

// Verify every inbound is (a) owned by the client, (b) received/staged, and
// (c) not already in another active outbound. Returns the inbound docs.
async function loadAndGateInbounds(
  db: any,
  client_id: string,
  inbound_ids: string[]
) {
  if (inbound_ids.length === 0) {
    throw new ApiError("EMPTY_INBOUND_LIST");
  }
  const dedup = Array.from(new Set(inbound_ids));
  if (dedup.length !== inbound_ids.length) {
    throw new ApiError("EMPTY_INBOUND_LIST");
  }

  const docs = await db
    .collection(collections.INBOUND)
    .find({ _id: { $in: dedup as any } })
    .toArray();
  const found = new Set(docs.map((d: any) => String(d._id)));
  const missing = dedup.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiError("INBOUND_OWNERSHIP_MISMATCH", {
      inboundIds: missing.join(","),
    });
  }
  const wrongOwner = docs.filter((d: any) => d.client_id !== client_id);
  if (wrongOwner.length > 0) {
    throw new ApiError("INBOUND_OWNERSHIP_MISMATCH", {
      inboundIds: wrongOwner.map((d: any) => String(d._id)).join(","),
    });
  }
  const notReady = docs.filter(
    (d: any) => d.status !== "received" && d.status !== "staged"
  );
  if (notReady.length > 0) {
    throw new ApiError("INBOUND_NOT_RECEIVED", {
      inboundIds: notReady.map((d: any) => String(d._id)).join(","),
    });
  }

  // Active-link guard via partial unique index — but we still pre-check to
  // give a clean error message.
  const activeLinks = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({ inbound_id: { $in: dedup }, unlinked_at: null })
    .toArray();
  if (activeLinks.length > 0) {
    throw new ApiError("INBOUND_ALREADY_IN_ACTIVE_OUTBOUND", {
      inboundIds: activeLinks.map((l: any) => l.inbound_id).join(","),
    });
  }

  return docs;
}

function estimateWeightKg(inbounds: any[]): number {
  let total = 0;
  let known = false;
  for (const ib of inbounds) {
    if (typeof ib.actualWeight === "number" && ib.actualWeight > 0) {
      total += ib.actualWeight;
      known = true;
    } else {
      total += DEFAULT_ESTIMATE_WEIGHT_KG;
    }
  }
  if (!known && inbounds.length > 0) {
    total = inbounds.length * DEFAULT_ESTIMATE_WEIGHT_KG;
  }
  return Math.max(0.1, total);
}

// Resolves the initial status for a new outbound. Carrier shipping cost is
// billed directly by the carrier against the client's own linked account,
// so the ShipItAsia wallet balance is irrelevant at this stage — every new
// outbound enters ready_for_label.
function resolveInitialStatus(
  _balance: number,
  _quote_total: number,
  _preference: "auto" | "confirm_before_label"
): { status: OutboundStatusV1; held_reason: OutboundHeldReason | null } {
  return { status: "ready_for_label", held_reason: null };
}

async function appendActionLog(params: {
  outbound_id: string;
  client_id: string;
  action:
    | "created"
    | "held"
    | "released"
    | "rate_quoted"
    | "balance_reserved"
    | "label_requested"
    | "label_obtained"
    | "label_failed"
    | "cancelled"
    | "single_completed";
  from_status: OutboundStatusV1 | null;
  to_status: OutboundStatusV1 | null;
  actor_type: "client" | "admin" | "system" | "staff";
  actor_id: string | null;
  detail?: Record<string, unknown>;
}) {
  const db = await connectToDatabase();
  await db.collection(collections.OUTBOUND_ACTION_LOG).insertOne({
    outbound_id: params.outbound_id,
    client_id: params.client_id,
    action: params.action,
    from_status: params.from_status,
    to_status: params.to_status,
    actor_type: params.actor_type,
    actor_id: params.actor_id,
    detail: params.detail ?? null,
    createdAt: new Date(),
  } as any);
}

// ── client: rate quote preview (no DB write outside rate_quote_logs) ──

export async function previewRateQuote(
  ctx: ClientContext,
  raw: unknown
): Promise<RateQuoteBreakdown> {
  const input = RateQuotePreviewInputSchema.parse(raw);
  return rateQuoteWithLog({
    outbound_id: null,
    client_id: ctx.client_id,
    carrier_code: input.carrier_code,
    destination_country: input.destination_country,
    weight_kg: input.weight_kg,
  });
}

// ── client: create consolidated outbound ─────────────────────

export async function createConsolidatedOutbound(
  ctx: ClientContext,
  raw: unknown
): Promise<OutboundRequestV1Public> {
  const input = CreateConsolidatedOutboundInputSchema.parse(raw);
  return createOutboundCore(ctx, {
    inbound_ids: input.inbound_ids,
    carrier_code: input.carrier_code,
    carrier_account_id: input.carrier_account_id ?? null,
    service_code: input.service_code,
    receiver_address: input.receiver_address,
    processing_preference: input.processing_preference,
    customer_remarks: input.customer_remarks,
    shipment_type: "consolidated",
  });
}

// ── client: create single (direct passthrough) outbound ──────

export async function createSingleOutbound(
  ctx: ClientContext,
  raw: unknown
): Promise<OutboundRequestV1Public> {
  const input = CreateSingleOutboundInputSchema.parse(raw);
  return createOutboundCore(ctx, {
    inbound_ids: [input.inbound_id],
    carrier_code: input.carrier_code,
    carrier_account_id: input.carrier_account_id ?? null,
    service_code: input.service_code,
    receiver_address: input.receiver_address,
    processing_preference: "auto", // single is always auto
    customer_remarks: input.customer_remarks,
    shipment_type: "single",
  });
}

interface CoreCreateInput {
  inbound_ids: string[];
  carrier_code: string;
  carrier_account_id: string | null;
  service_code?: string;
  receiver_address: any;
  processing_preference: "auto" | "confirm_before_label";
  customer_remarks?: string;
  shipment_type: "consolidated" | "single";
}

async function createOutboundCore(
  ctx: ClientContext,
  input: CoreCreateInput
): Promise<OutboundRequestV1Public> {
  const db = await connectToDatabase();
  if (input.shipment_type === "single" && input.inbound_ids.length !== 1) {
    throw new ApiError("SINGLE_REQUIRES_ONE_INBOUND");
  }
  // Carrier sanity + (optional) account binding
  const carrier = await lookupCarrier(db, input.carrier_code);
  if (carrier.auth_type === "oauth" && !input.carrier_account_id) {
    throw new ApiError("CARRIER_ACCOUNT_REQUIRED", {
      code: input.carrier_code,
    });
  }
  if (input.carrier_account_id) {
    await lookupClientCarrierAccount(db, ctx.client_id, input.carrier_account_id);
  }
  // Inbound gating
  const inbounds = await loadAndGateInbounds(db, ctx.client_id, input.inbound_ids);
  // Warehouse: in v1 all inbounds in a single outbound must share one warehouse.
  const warehouses = Array.from(
    new Set(inbounds.map((d: any) => d.warehouseCode))
  );
  if (warehouses.length !== 1) {
    throw new ApiError("EMPTY_INBOUND_LIST");
  }
  const warehouseCode = warehouses[0] as string;

  // Rate quote (estimate weight from declared/actual)
  const estWeight = estimateWeightKg(inbounds);
  const quote = await rateQuoteWithLog({
    outbound_id: null,
    client_id: ctx.client_id,
    carrier_code: input.carrier_code,
    destination_country: input.receiver_address.country_code,
    weight_kg: estWeight,
  });

  // Balance check
  const balance = await walletService.getBalance(ctx.client_id);
  const { status, held_reason } = resolveInitialStatus(
    balance,
    quote.total,
    input.processing_preference
  );

  // ID mint + insert atomically with links
  const outbound_id = await nextDailyId("OUT");
  const now = new Date();
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.OUTBOUND).insertOne(
        {
          _id: outbound_id as any,
          client_id: ctx.client_id,
          warehouseCode,
          shipment_type: input.shipment_type,
          inbound_count: inbounds.length,
          carrier_code: input.carrier_code,
          carrier_account_id: input.carrier_account_id,
          service_code: input.service_code ?? null,
          destination_country: input.receiver_address.country_code,
          receiver_address: input.receiver_address,
          processing_preference: input.processing_preference,
          status,
          held_reason,
          held_since: held_reason ? now : null,
          held_detail:
            held_reason === "insufficient_balance"
              ? `need HK$${quote.total}, balance HK$${balance}`
              : null,
          declared_weight_kg: estWeight,
          actual_weight_kg: null,
          actual_dimension: null,
          rate_quote: quote,
          quoted_amount_hkd: quote.total,
          label_url: null,
          label_obtained_at: null,
          tracking_no: null,
          departed_at: null,
          cancelled_at: null,
          cancel_reason: null,
          cancelled_by_actor_type: null,
          customer_remarks: input.customer_remarks ?? null,
          createdAt: now,
          updatedAt: now,
        } as any,
        { session }
      );

      const linkDocs = inbounds.map((d: any) => ({
        outbound_id,
        inbound_id: String(d._id),
        client_id: ctx.client_id,
        linked_at: now,
        unlinked_at: null,
        unlink_reason: null,
      }));
      if (linkDocs.length > 0) {
        await db
          .collection(collections.OUTBOUND_INBOUND_LINK)
          .insertMany(linkDocs as any, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  // Action log + audit + notification (outside the tx — non-critical paths)
  await appendActionLog({
    outbound_id,
    client_id: ctx.client_id,
    action: "created",
    from_status: null,
    to_status: status,
    actor_type: "client",
    actor_id: ctx.client_id,
    detail: {
      shipment_type: input.shipment_type,
      inbound_ids: input.inbound_ids,
      carrier_code: input.carrier_code,
      destination_country: input.receiver_address.country_code,
      quote_total: quote.total,
    },
  });

  if (held_reason) {
    await appendActionLog({
      outbound_id,
      client_id: ctx.client_id,
      action: "held",
      from_status: status,
      to_status: status,
      actor_type: "system",
      actor_id: null,
      detail: { held_reason, quote_total: quote.total, balance },
    });
  }

  await logAudit({
    action: AUDIT_ACTIONS.outbound_created,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.outbound,
    target_id: outbound_id,
    details: {
      shipment_type: input.shipment_type,
      carrier_code: input.carrier_code,
      inbound_count: inbounds.length,
      quote_total: quote.total,
      initial_status: status,
      held_reason,
    },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  await createNotification({
    client_id: ctx.client_id,
    type: "outbound_created",
    title: "出庫單建立成功",
    body: `出庫單 ${outbound_id} 已建立，預估運費 HK$${quote.total}（由 carrier 直接收取）。`,
    reference_type: "outbound",
    reference_id: outbound_id,
    action_url: `/zh-hk/outbound/${outbound_id}`,
  });

  // Re-fetch projected doc
  const doc = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  if (!doc) throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outbound_id });
  return projectOutboundV1(doc);
}

// ── client: list / get / cancel ──────────────────────────────

export interface ListOutboundOptions {
  status?: OutboundStatusV1 | OutboundStatusV1[];
  limit?: number;
  offset?: number;
}

export async function listMyOutbounds(
  client_id: string,
  options: ListOutboundOptions = {}
) {
  const db = await connectToDatabase();
  const filter: Record<string, unknown> = { client_id };
  if (options.status) {
    filter.status = Array.isArray(options.status)
      ? { $in: options.status }
      : options.status;
  }
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;
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

export async function getMyOutbound(client_id: string, outbound_id: string) {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any, client_id });
  if (!doc) throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outbound_id });
  return projectOutboundV1(doc);
}

export async function cancelMyOutbound(
  ctx: ClientContext,
  outbound_id: string,
  raw: unknown
): Promise<OutboundRequestV1Public> {
  const reason = ((raw as any)?.cancel_reason ?? "").toString().slice(0, 200);
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any, client_id: ctx.client_id });
  if (!doc) {
    throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outbound_id });
  }
  if (!CLIENT_CANCELLABLE_STATUSES.includes(doc.status)) {
    throw new ApiError("CANNOT_CANCEL_IN_CURRENT_STATUS", {
      status: doc.status,
    });
  }
  const now = new Date();
  await db.collection(collections.OUTBOUND).updateOne(
    { _id: outbound_id as any, status: doc.status },
    {
      $set: {
        status: "cancelled",
        cancelled_at: now,
        cancel_reason: reason || null,
        cancelled_by_actor_type: "client",
        updatedAt: now,
      },
    }
  );
  // Release inbound links (soft delete).
  await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .updateMany(
      { outbound_id, unlinked_at: null },
      { $set: { unlinked_at: now, unlink_reason: "outbound_cancelled" } }
    );

  await appendActionLog({
    outbound_id,
    client_id: ctx.client_id,
    action: "cancelled",
    from_status: doc.status,
    to_status: "cancelled",
    actor_type: "client",
    actor_id: ctx.client_id,
    detail: { reason },
  });
  await logAudit({
    action: AUDIT_ACTIONS.outbound_cancelled,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.outbound,
    target_id: outbound_id,
    details: { from_status: doc.status, reason },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });
  await createNotification({
    client_id: ctx.client_id,
    type: "outbound_cancelled",
    title: "出庫單已取消",
    body: `出庫單 ${outbound_id} 已取消${reason ? `：${reason}` : ""}`,
    reference_type: "outbound",
    reference_id: outbound_id,
    action_url: `/zh-hk/outbound/${outbound_id}`,
  });

  const after = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  return projectOutboundV1(after);
}

// ── system: release held by balance ──────────────────────────

/**
 * Called by walletService.onTopupApproved after a successful topup. For each
 * held(insufficient_balance) outbound, if balance now covers the stored
 * quote, advance to ready_for_label / pending_client_label per preference.
 *
 * Order: oldest held first (fair queuing). The function is best-effort —
 * any single outbound that fails to release leaves the rest unaffected.
 */
export async function releaseHeldByBalance(client_id: string) {
  const db = await connectToDatabase();
  const cursor = db
    .collection(collections.OUTBOUND)
    .find({
      client_id,
      status: HELD_RELEASE_TARGET,
      held_reason: "insufficient_balance",
    })
    .sort({ held_since: 1 });
  const docs = await cursor.toArray();

  let released = 0;
  for (const doc of docs) {
    const balance = await walletService.getBalance(client_id);
    const need = doc.quoted_amount_hkd ?? doc.rate_quote?.total ?? 0;
    if (balance < need) break; // can't afford any further; stop loop
    // Released outbounds always go back to ready_for_label so they can
    // enter P8 pick/pack/weigh. The confirm_before_label preference is
    // honored at the post-weigh checkpoint.
    const next: OutboundStatusV1 = "ready_for_label";
    const now = new Date();
    const upd = await db.collection(collections.OUTBOUND).updateOne(
      { _id: doc._id, status: HELD_RELEASE_TARGET },
      {
        $set: {
          status: next,
          held_reason: null,
          held_since: null,
          held_detail: null,
          updatedAt: now,
        },
      }
    );
    if (upd.modifiedCount === 0) continue;
    released += 1;
    await appendActionLog({
      outbound_id: String(doc._id),
      client_id,
      action: "released",
      from_status: HELD_RELEASE_TARGET,
      to_status: next,
      actor_type: "system",
      actor_id: null,
      detail: { reason: "balance_covered", new_balance: balance, quote: need },
    });
    await logAudit({
      action: AUDIT_ACTIONS.outbound_held_released,
      actor_type: AUDIT_ACTOR_TYPES.system,
      actor_id: null,
      target_type: AUDIT_TARGET_TYPES.outbound,
      target_id: String(doc._id),
      details: { reason: "balance_covered", from_status: HELD_RELEASE_TARGET, to_status: next },
    });
    await createNotification({
      client_id,
      type: "outbound_held_released",
      title: "出庫單已解除暫存",
      body: `出庫單 ${String(doc._id)} 餘額已足夠，將進入出庫處理流程。`,
      reference_type: "outbound",
      reference_id: String(doc._id),
      action_url: `/zh-hk/outbound/${String(doc._id)}`,
    });
  }
  return { released };
}

// ── admin ────────────────────────────────────────────────────

export async function adminListOutbounds(filters: {
  client_id?: string;
  status?: OutboundStatusV1 | OutboundStatusV1[];
  carrier_code?: string;
  held_reason?: OutboundHeldReason;
  limit?: number;
  offset?: number;
}) {
  const db = await connectToDatabase();
  const filter: Record<string, unknown> = {};
  if (filters.client_id) filter.client_id = filters.client_id;
  if (filters.status) {
    filter.status = Array.isArray(filters.status)
      ? { $in: filters.status }
      : filters.status;
  }
  if (filters.carrier_code) filter.carrier_code = filters.carrier_code;
  if (filters.held_reason) filter.held_reason = filters.held_reason;
  const limit = Math.min(filters.limit ?? 100, 500);
  const offset = filters.offset ?? 0;
  const total = await db.collection(collections.OUTBOUND).countDocuments(filter);
  const docs = await db
    .collection(collections.OUTBOUND)
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  return { items: docs.map(projectOutboundV1Admin), total };
}

export async function adminGetOutbound(outbound_id: string) {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  if (!doc) throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outbound_id });
  return projectOutboundV1Admin(doc);
}

export async function adminReleaseHeld(
  outbound_id: string,
  ctx: AdminContext,
  raw: unknown
) {
  const note = ((raw as any)?.note ?? "").toString().slice(0, 200);
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  if (!doc) throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outbound_id });
  if (doc.status !== "held") {
    throw new ApiError("CANNOT_RELEASE_NOT_HELD");
  }
  const next: OutboundStatusV1 = "ready_for_label";
  const now = new Date();
  const upd = await db.collection(collections.OUTBOUND).updateOne(
    { _id: outbound_id as any, status: "held" },
    {
      $set: {
        status: next,
        held_reason: null,
        held_since: null,
        held_detail: null,
        updatedAt: now,
      },
    }
  );
  if (upd.modifiedCount === 0) {
    throw new ApiError("OUTBOUND_INVALID_STATUS", { status: doc.status });
  }
  await appendActionLog({
    outbound_id,
    client_id: doc.client_id,
    action: "released",
    from_status: "held",
    to_status: next,
    actor_type: "admin",
    actor_id: ctx.staff_id,
    detail: { reason: "admin_override", note },
  });
  await logAudit({
    action: AUDIT_ACTIONS.outbound_held_released,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.outbound,
    target_id: outbound_id,
    details: { reason: "admin_override", note, to_status: next },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });
  await createNotification({
    client_id: doc.client_id,
    type: "outbound_held_released",
    title: "出庫單已由客服解除暫存",
    body: `出庫單 ${outbound_id} 已由客服釋放，將進入處理流程${note ? `（${note}）` : ""}。`,
    reference_type: "outbound",
    reference_id: outbound_id,
    action_url: `/zh-hk/outbound/${outbound_id}`,
  });
  return adminGetOutbound(outbound_id);
}

// ── P8 hook: weight verified (called from WMS reweigh flow) ──

/**
 * P8 wires this in after the reweigh step. We:
 *   1) re-quote with the actual weight (the quote at create-time was
 *      based on declared/estimated weight)
 *   2) update actual_weight_kg + new rate_quote + quoted_amount_hkd
 *   3) leave status alone (P8 continues to picking/packed downstream)
 *
 * If the new quote exceeds available balance, we *don't* flip back to held
 * here — that violates the principle of locking once WMS has the goods.
 * The wallet charge at label-fetch time enforces the actual gate; if the
 * client can't pay there, status moves to held(label_failed_retry).
 */
export async function afterWeightVerified(input: {
  outbound_id: string;
  actual_weight_kg: number;
  actual_dimension?: { length: number; width: number; height: number };
}) {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: input.outbound_id as any });
  if (!doc) {
    throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", {
      orderId: input.outbound_id,
    });
  }
  const quote = await rateQuoteWithLog({
    outbound_id: input.outbound_id,
    client_id: doc.client_id,
    carrier_code: doc.carrier_code,
    destination_country: doc.destination_country,
    weight_kg: input.actual_weight_kg,
  });
  const now = new Date();
  await db.collection(collections.OUTBOUND).updateOne(
    { _id: input.outbound_id as any },
    {
      $set: {
        status: "weight_verified",
        actual_weight_kg: input.actual_weight_kg,
        actual_dimension: input.actual_dimension ?? null,
        rate_quote: quote,
        quoted_amount_hkd: quote.total,
        updatedAt: now,
      },
    }
  );
  await appendActionLog({
    outbound_id: input.outbound_id,
    client_id: doc.client_id,
    action: "rate_quoted",
    from_status: doc.status,
    to_status: "weight_verified",
    actor_type: "system",
    actor_id: null,
    detail: { weight_kg: input.actual_weight_kg, quote_total: quote.total },
  });
  return { quote };
}

// ── P8 hook: fetch label + wallet charge ─────────────────────

/**
 * Called by P8 once weight_verified is reached and the client (for the
 * confirm-before-label flow) has confirmed. Atomically:
 *   1) wallet charge for quote.total
 *   2) carrier adapter.getLabel()
 *   3) update outbound row with label_url + tracking_no
 *
 * If wallet charge or label fetch fails, the outbound is moved to
 * held(label_failed_retry) so the warehouse can investigate. Wallet
 * refunds are not auto-issued at this layer — the admin issues them
 * explicitly via walletService.refund if the failure is on our side.
 */
export async function fetchLabel(input: {
  outbound_id: string;
}): Promise<{ label_url: string; tracking_no: string; charged: number }> {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: input.outbound_id as any });
  if (!doc) throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: input.outbound_id });
  if (doc.label_url) throw new ApiError("ALREADY_HAS_LABEL");
  if (doc.status !== "ready_for_label" && doc.status !== "weight_verified") {
    throw new ApiError("OUTBOUND_INVALID_STATUS", { status: doc.status });
  }
  // Carrier shipping cost is billed directly to the client's own carrier
  // account (OAuth-linked). ShipItAsia wallet is not charged for shipping,
  // so no pre-flight balance gate here.

  // Move to label_obtaining first (so concurrent calls can't double-charge).
  const claim = await db.collection(collections.OUTBOUND).findOneAndUpdate(
    { _id: input.outbound_id as any, status: { $in: ["ready_for_label", "weight_verified"] } },
    { $set: { status: "label_obtaining", updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  const claimed: any =
    claim && (claim as any).value !== undefined ? (claim as any).value : claim;
  if (!claimed) {
    throw new ApiError("OUTBOUND_INVALID_STATUS", { status: doc.status });
  }

  let charged: number;
  let label_url: string;
  let tracking_no: string;
  try {
    const adapter = await getCarrierAdapter(doc.carrier_code);
    const labelResp = await adapter.getLabel({
      outbound_id: String(doc._id),
      destination_country: doc.destination_country,
      weight_kg: doc.actual_weight_kg ?? doc.declared_weight_kg ?? 0,
      receiver_name: doc.receiver_address?.name ?? "",
      receiver_address: [
        doc.receiver_address?.address,
        doc.receiver_address?.city,
        doc.receiver_address?.country_code,
      ]
        .filter(Boolean)
        .join(", "),
    });
    charged = labelResp.charged_amount;
    label_url = labelResp.label_url;
    tracking_no = labelResp.tracking_no;

    // No wallet charge — carrier bills the client's own account directly.
    // `charged` is recorded on the outbound row for reference only.

    const now = new Date();
    await db.collection(collections.OUTBOUND).updateOne(
      { _id: input.outbound_id as any },
      {
        $set: {
          status: "label_obtained",
          label_url,
          label_obtained_at: now,
          tracking_no,
          updatedAt: now,
        },
      }
    );
    await appendActionLog({
      outbound_id: input.outbound_id,
      client_id: doc.client_id,
      action: "label_obtained",
      from_status: "label_obtaining",
      to_status: "label_obtained",
      actor_type: "system",
      actor_id: null,
      detail: { tracking_no, charged },
    });
    await logAudit({
      action: AUDIT_ACTIONS.outbound_label_obtained,
      actor_type: AUDIT_ACTOR_TYPES.system,
      actor_id: null,
      target_type: AUDIT_TARGET_TYPES.outbound,
      target_id: input.outbound_id,
      details: { tracking_no, charged, carrier_code: doc.carrier_code },
    });
    await createNotification({
      client_id: doc.client_id,
      type: "outbound_label_obtained",
      title: "出庫面單已取得",
      body: `出庫單 ${input.outbound_id} 已取得面單，追蹤號 ${tracking_no}，運費 HK$${charged} 由 ${doc.carrier_code} 直接收取。`,
      reference_type: "outbound",
      reference_id: input.outbound_id,
      action_url: `/zh-hk/outbound/${input.outbound_id}`,
    });
    return { label_url, tracking_no, charged };
  } catch (err) {
    // Revert label_obtaining → held(label_failed_retry)
    const now = new Date();
    await db.collection(collections.OUTBOUND).updateOne(
      { _id: input.outbound_id as any, status: "label_obtaining" },
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
    await appendActionLog({
      outbound_id: input.outbound_id,
      client_id: doc.client_id,
      action: "label_failed",
      from_status: "label_obtaining",
      to_status: "held",
      actor_type: "system",
      actor_id: null,
      detail: { error: String((err as any)?.message ?? err) },
    });
    await logAudit({
      action: AUDIT_ACTIONS.outbound_label_failed,
      actor_type: AUDIT_ACTOR_TYPES.system,
      actor_id: null,
      target_type: AUDIT_TARGET_TYPES.outbound,
      target_id: input.outbound_id,
      details: { error: String((err as any)?.message ?? err), carrier_code: doc.carrier_code },
    });
    throw err;
  }
}

export const outboundService = {
  previewRateQuote,
  createConsolidatedOutbound,
  createSingleOutbound,
  listMyOutbounds,
  getMyOutbound,
  cancelMyOutbound,
  releaseHeldByBalance,
  adminListOutbounds,
  adminGetOutbound,
  adminReleaseHeld,
  afterWeightVerified,
  fetchLabel,
};

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
import { nextDailyId } from "@/services/util/daily-counter";
import { walletService } from "@/services/wallet/walletService";
import { normalizeTrackingNo } from "@/types/InboundV1";
import { ObjectId } from "mongodb";
import { z } from "zod";

export interface AdminContext {
  staff_id: string;
  warehouseCode: string;
  ip_address?: string;
  user_agent?: string;
}

export interface ClientContext {
  client_id: string;
  ip_address?: string;
  user_agent?: string;
}

const HANDLING_FEE = parseInt(process.env.HANDLING_FEE_PER_PACKAGE || "5", 10);

// ── derive size_estimate from actual dimension ──────────────

function deriveSizeEstimate(dim: {
  length: number;
  width: number;
  height: number;
}): "small" | "medium" | "large" {
  const volume = dim.length * dim.width * dim.height;
  const SMALL = parseInt(process.env.SIZE_ESTIMATE_SMALL_MAX || "5000", 10);
  const MEDIUM = parseInt(process.env.SIZE_ESTIMATE_MEDIUM_MAX || "30000", 10);
  if (volume <= SMALL) return "small";
  if (volume <= MEDIUM) return "medium";
  return "large";
}

// ── helper: find latest active assignment ──────────────────

function findActiveAssignment(unclaimed: any, client_id?: string) {
  const history = unclaimed.assignment_history ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.cancelled_at || h.rejected_at || h.accepted_at) continue;
    if (client_id && h.client_id !== client_id) continue;
    return { entry: h, index: i };
  }
  return null;
}

function wasPreviouslyRejectedBy(unclaimed: any, client_id: string): boolean {
  const history = unclaimed.assignment_history ?? [];
  return history.some(
    (h: any) =>
      h.client_id === client_id && h.rejected_at && !h.cancelled_at
  );
}

// ── CS assign ───────────────────────────────────────────────

export const AssignInputSchema = z
  .object({ client_id: z.string().min(1) })
  .strict();

export async function assignUnclaimedToClient(
  unclaimed_id: string,
  raw: unknown,
  actor: AdminContext
) {
  const { client_id } = AssignInputSchema.parse(raw);
  const db = await connectToDatabase();

  // Verify client exists
  let clientObjId: ObjectId;
  try {
    clientObjId = new ObjectId(client_id);
  } catch {
    throw new ApiError("UNAUTHORIZED");
  }
  const client = await db
    .collection(collections.CLIENT)
    .findOne({ _id: clientObjId });
  if (!client) throw new ApiError("UNAUTHORIZED");

  const unclaimed = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .findOne({ _id: unclaimed_id as any });
  if (!unclaimed) throw new ApiError("UNCLAIMED_NOT_AVAILABLE");
  if (unclaimed.status !== "pending_assignment") {
    throw new ApiError("UNCLAIMED_NOT_AVAILABLE");
  }

  if (wasPreviouslyRejectedBy(unclaimed, client_id)) {
    throw new ApiError("PREVIOUSLY_REJECTED_BY_CLIENT");
  }
  if (findActiveAssignment(unclaimed)) {
    throw new ApiError("ALREADY_ASSIGNED");
  }

  const now = new Date();
  const entry = {
    client_id,
    assigned_at: now,
    assigned_by_staff_id: actor.staff_id,
    source: "cs_assignment",
    cs_note: null,
    cancelled_at: null,
    rejected_at: null,
    reject_reason: null,
    reject_note: null,
    accepted_at: null,
  };
  // Atomic update — only push if no active assignment.
  const upd = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .updateOne(
      { _id: unclaimed_id as any, status: "pending_assignment" },
      { $push: { assignment_history: entry as any }, $set: { updatedAt: now } }
    );
  if (upd.modifiedCount === 0) throw new ApiError("UNCLAIMED_NOT_AVAILABLE");

  await createNotification({
    client_id,
    type: "inbound_unclaimed_assigned",
    title: "您有一筆無頭件待確認",
    body: `系統發現一筆無頭件可能屬於您（${unclaimed.tracking_no}），請至「我的預報 > 待確認」確認接收`,
    reference_type: "unclaimed",
    reference_id: unclaimed_id,
    action_url: `/zh-hk/inbound/list?tab=pending_confirm`,
  });

  await logAudit({
    action: AUDIT_ACTIONS.unclaimed_assigned,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: actor.staff_id,
    target_type: AUDIT_TARGET_TYPES.unclaimed_inbound,
    target_id: unclaimed_id,
    details: { client_id, tracking_no: unclaimed.tracking_no },
    warehouse_code: actor.warehouseCode,
  });

  return { success: true };
}

export async function cancelAssignment(
  unclaimed_id: string,
  actor: AdminContext
) {
  const db = await connectToDatabase();
  const unclaimed = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .findOne({ _id: unclaimed_id as any });
  if (!unclaimed) throw new ApiError("UNCLAIMED_NOT_AVAILABLE");
  const active = findActiveAssignment(unclaimed);
  if (!active) throw new ApiError("NO_ASSIGNMENT_TO_CANCEL");

  const path = `assignment_history.${active.index}.cancelled_at`;
  await db
    .collection(collections.UNCLAIMED_INBOUND)
    .updateOne(
      { _id: unclaimed_id as any },
      { $set: { [path]: new Date(), updatedAt: new Date() } }
    );

  await createNotification({
    client_id: active.entry.client_id,
    type: "inbound_unclaimed_assignment_cancelled",
    title: "先前指派已撤回",
    body: `先前指派給您的無頭件已撤回，您無需處理`,
    reference_type: "unclaimed",
    reference_id: unclaimed_id,
  });

  await logAudit({
    action: AUDIT_ACTIONS.unclaimed_assignment_cancelled,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: actor.staff_id,
    target_type: AUDIT_TARGET_TYPES.unclaimed_inbound,
    target_id: unclaimed_id,
    details: { client_id: active.entry.client_id },
    warehouse_code: actor.warehouseCode,
  });

  return { success: true };
}

// ── CS dispose ──────────────────────────────────────────────

export const DisposeInputSchema = z
  .object({ disposed_reason: z.string().min(1).max(500) })
  .strict();

export async function disposeUnclaimed(
  unclaimed_id: string,
  raw: unknown,
  actor: AdminContext
) {
  const { disposed_reason } = DisposeInputSchema.parse(raw);
  const db = await connectToDatabase();
  const upd = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .findOneAndUpdate(
      { _id: unclaimed_id as any, status: "pending_assignment" },
      {
        $set: {
          status: "disposed",
          disposed_at: new Date(),
          disposed_reason,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );
  const updated =
    upd && (upd as any).value !== undefined ? (upd as any).value : upd;
  if (!updated) throw new ApiError("CANNOT_DISPOSE_NON_PENDING");

  // Write scan row for audit timeline
  const scan_id = await nextDailyId("S");
  await db.collection(collections.INBOUND_SCAN).insertOne({
    _id: scan_id as any,
    inbound_request_id: null,
    unclaimed_inbound_id: unclaimed_id,
    client_id: null,
    type: "unclaimed_arrive", // reuse type — disposed events also tracked here
    locationCode: null,
    photo_paths: [],
    photo_metadata: [],
    anomalies: [],
    operator_staff_id: actor.staff_id,
    is_combined_arrive: false,
    staff_note: `Disposed: ${disposed_reason}`,
    cancelled_at: null,
    cancelled_reason: null,
    createdAt: new Date(),
  } as any);

  await logAudit({
    action: AUDIT_ACTIONS.unclaimed_disposed,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: actor.staff_id,
    target_type: AUDIT_TARGET_TYPES.unclaimed_inbound,
    target_id: unclaimed_id,
    details: { disposed_reason },
    warehouse_code: actor.warehouseCode,
  });

  return { success: true };
}

// ── CS auto-match existing inbound ──────────────────────────

export async function matchExistingInbound(unclaimed_id: string) {
  const db = await connectToDatabase();
  const unclaimed = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .findOne({ _id: unclaimed_id as any });
  if (!unclaimed) throw new ApiError("UNCLAIMED_NOT_AVAILABLE");

  const candidates = await db
    .collection(collections.INBOUND)
    .find({
      tracking_no_normalized: unclaimed.tracking_no_normalized,
      status: { $in: ["pending"] },
    })
    .limit(5)
    .toArray();

  return {
    matched: candidates.length > 0,
    candidates: candidates.map((c: any) => ({
      _id: c._id,
      client_id: c.client_id,
      tracking_no: c.tracking_no,
      carrier_inbound_code: c.carrier_inbound_code,
      shipment_type: c.shipment_type,
      declared_items_count: c.declared_items_count,
      createdAt: c.createdAt,
    })),
  };
}

// ── client accept ───────────────────────────────────────────

export const AcceptInputSchema = z
  .object({
    inbound_source: z.enum(["regular", "return", "gift", "other"]),
    declared_items: z
      .array(
        z.object({
          category_id: z.string().min(1),
          subcategory_id: z.string().min(1),
          product_name: z.string().min(1).max(200).trim(),
          product_url: z.string().optional(),
          quantity: z.coerce.number().int().positive(),
          unit_price: z.coerce.number().nonnegative(),
        })
      )
      .min(1)
      .max(50),
    customer_remarks: z.string().max(200).optional(),
  })
  .strict();

export async function acceptUnclaimed(
  unclaimed_id: string,
  raw: unknown,
  ctx: ClientContext
): Promise<{ inbound_id: string; charged: number; balance_after: number }> {
  const input = AcceptInputSchema.parse(raw);
  const db = await connectToDatabase();

  const unclaimed = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .findOne({ _id: unclaimed_id as any });
  if (!unclaimed) throw new ApiError("UNCLAIMED_NOT_AVAILABLE");
  if (unclaimed.status !== "pending_assignment") {
    throw new ApiError("UNCLAIMED_NOT_AVAILABLE");
  }

  const active = findActiveAssignment(unclaimed, ctx.client_id);
  if (!active) throw new ApiError("UNCLAIMED_NOT_AVAILABLE_FOR_CLIENT");

  const warehouse = await db
    .collection(collections.WAREHOUSE)
    .findOne({ warehouseCode: unclaimed.warehouseCode });
  const currency = warehouse?.declared_currency ?? "JPY";

  // Build merge candidate — client may have a pending inbound with same
  // tracking. If so, upgrade it instead of creating a new one (AC-6.5).
  const merge = await db.collection(collections.INBOUND).findOne({
    client_id: ctx.client_id,
    tracking_no_normalized: unclaimed.tracking_no_normalized,
    status: "pending",
  });

  const now = new Date();
  let inbound_id: string;
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      if (merge) {
        inbound_id = String(merge._id);
        await db.collection(collections.INBOUND).updateOne(
          { _id: merge._id as any },
          {
            $set: {
              status: "received",
              actualWeight: unclaimed.weight,
              actualDimension: unclaimed.dimension,
              arrivedAt: unclaimed.arrived_at,
              receivedAt: now,
              inbound_source: input.inbound_source,
              customer_remarks: input.customer_remarks ?? null,
              size_estimate: deriveSizeEstimate(unclaimed.dimension),
              from_unclaimed_id: unclaimed_id,
              from_unclaimed_source: "cs_assignment",
              declared_items_count: input.declared_items.length,
              declared_value_total: input.declared_items.reduce(
                (s, it) => s + it.quantity * it.unit_price,
                0
              ),
              updatedAt: now,
            },
          },
          { session }
        );
        await db
          .collection(collections.INBOUND_DECLARED_ITEM)
          .deleteMany({ inbound_request_id: merge._id }, { session });
        await db.collection(collections.INBOUND_DECLARED_ITEM).insertMany(
          input.declared_items.map((it, i) => ({
            inbound_request_id: merge._id,
            client_id: ctx.client_id,
            category_id: it.category_id,
            subcategory_id: it.subcategory_id,
            product_name: it.product_name,
            product_url: it.product_url ?? null,
            quantity: it.quantity,
            unit_price: it.unit_price,
            currency,
            subtotal: it.quantity * it.unit_price,
            display_order: i,
            createdAt: now,
            updatedAt: now,
          })),
          { session }
        );
      } else {
        inbound_id = await nextDailyId("I");
        await db.collection(collections.INBOUND).insertOne(
          {
            _id: inbound_id as any,
            client_id: ctx.client_id,
            warehouseCode: unclaimed.warehouseCode,
            carrier_inbound_code: unclaimed.carrier_inbound_code,
            tracking_no: unclaimed.tracking_no,
            tracking_no_normalized: unclaimed.tracking_no_normalized,
            inbound_source: input.inbound_source,
            size_estimate: deriveSizeEstimate(unclaimed.dimension),
            contains_liquid: false,
            contains_battery: false,
            shipment_type: "consolidated",
            single_shipping: null,
            customer_remarks: input.customer_remarks ?? null,
            declared_value_total: input.declared_items.reduce(
              (s, it) => s + it.quantity * it.unit_price,
              0
            ),
            declared_currency: currency,
            declared_items_count: input.declared_items.length,
            status: "received",
            actualWeight: unclaimed.weight,
            actualDimension: unclaimed.dimension,
            arrivedAt: unclaimed.arrived_at,
            receivedAt: now,
            from_unclaimed_id: unclaimed_id,
            from_unclaimed_source: "cs_assignment",
            createdAt: now,
            updatedAt: now,
          } as any,
          { session }
        );
        await db.collection(collections.INBOUND_DECLARED_ITEM).insertMany(
          input.declared_items.map((it, i) => ({
            inbound_request_id: inbound_id,
            client_id: ctx.client_id,
            category_id: it.category_id,
            subcategory_id: it.subcategory_id,
            product_name: it.product_name,
            product_url: it.product_url ?? null,
            quantity: it.quantity,
            unit_price: it.unit_price,
            currency,
            subtotal: it.quantity * it.unit_price,
            display_order: i,
            createdAt: now,
            updatedAt: now,
          })),
          { session }
        );
      }

      // item_locations: re-key the unclaimed bucket to the new inbound_id
      await db.collection(collections.ITEM_LOCATION).updateOne(
        { itemCode: `unclaimed_${unclaimed_id}` },
        {
          $set: {
            itemCode: inbound_id,
            updatedAt: now,
          },
        },
        { session }
      );

      // Flip unclaimed → assigned + mark the latest assignment_history
      // accepted.
      const path = `assignment_history.${active.index}.accepted_at`;
      await db.collection(collections.UNCLAIMED_INBOUND).updateOne(
        { _id: unclaimed_id as any },
        {
          $set: {
            status: "assigned",
            assigned_at: now,
            assigned_to_client_id: ctx.client_id,
            assigned_to_inbound_id: inbound_id,
            [path]: now,
            updatedAt: now,
          },
        },
        { session }
      );

      // Write inbound_scans row
      const scan_id = await nextDailyId("S");
      await db.collection(collections.INBOUND_SCAN).insertOne(
        {
          _id: scan_id as any,
          inbound_request_id: inbound_id,
          unclaimed_inbound_id: unclaimed_id,
          client_id: ctx.client_id,
          type: "unclaimed_arrive",
          locationCode: null,
          photo_paths: [],
          photo_metadata: [],
          anomalies: [],
          operator_staff_id: "SYSTEM",
          is_combined_arrive: false,
          staff_note: `Unclaimed assigned and accepted by client`,
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

  // charge HK$5 outside the txn (walletService owns its own session)
  const chargeResult = await walletService.charge({
    client_id: ctx.client_id,
    amount: HANDLING_FEE,
    reference_type: "inbound",
    reference_id: inbound_id!,
    customer_note: `處理費 HK$${HANDLING_FEE}（無頭件接受）`,
  });

  await createNotification({
    client_id: ctx.client_id,
    type: "inbound_received",
    title: "貨物已上架",
    body: `您接受的貨 ${inbound_id!} 已上架，扣處理費 HK$${HANDLING_FEE}，餘額 HK$${chargeResult.balance_after}`,
    reference_type: "inbound",
    reference_id: inbound_id!,
    action_url: `/zh-hk/inbound/${inbound_id!}`,
  });

  await logAudit({
    action: merge
      ? AUDIT_ACTIONS.unclaimed_merged_to_existing
      : AUDIT_ACTIONS.unclaimed_accepted_by_client,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.unclaimed_inbound,
    target_id: unclaimed_id,
    details: { inbound_id: inbound_id!, charged: HANDLING_FEE, merged: !!merge },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return {
    inbound_id: inbound_id!,
    charged: HANDLING_FEE,
    balance_after: chargeResult.balance_after,
  };
}

// ── client reject ───────────────────────────────────────────

export const RejectInputSchema = z
  .object({
    reject_reason: z.enum([
      "not_mine",
      "wrong_address",
      "already_received_elsewhere",
      "other",
    ]),
    reject_note: z.string().max(500).optional(),
  })
  .strict();

export async function rejectUnclaimed(
  unclaimed_id: string,
  raw: unknown,
  ctx: ClientContext
) {
  const input = RejectInputSchema.parse(raw);
  if (input.reject_reason === "other" && !input.reject_note) {
    throw new ApiError("REJECT_NOTE_REQUIRED");
  }
  const db = await connectToDatabase();
  const unclaimed = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .findOne({ _id: unclaimed_id as any });
  if (!unclaimed) throw new ApiError("UNCLAIMED_NOT_AVAILABLE");
  const active = findActiveAssignment(unclaimed, ctx.client_id);
  if (!active) throw new ApiError("UNCLAIMED_NOT_AVAILABLE_FOR_CLIENT");

  const now = new Date();
  const pathRejected = `assignment_history.${active.index}.rejected_at`;
  const pathReason = `assignment_history.${active.index}.reject_reason`;
  const pathNote = `assignment_history.${active.index}.reject_note`;
  await db.collection(collections.UNCLAIMED_INBOUND).updateOne(
    { _id: unclaimed_id as any },
    {
      $set: {
        [pathRejected]: now,
        [pathReason]: input.reject_reason,
        [pathNote]: input.reject_note ?? null,
        updatedAt: now,
      },
    }
  );

  await db.collection(collections.INBOUND_SCAN).insertOne({
    _id: (await nextDailyId("S")) as any,
    inbound_request_id: null,
    unclaimed_inbound_id: unclaimed_id,
    client_id: ctx.client_id,
    type: "unclaimed_arrive",
    locationCode: null,
    photo_paths: [],
    photo_metadata: [],
    anomalies: [],
    operator_staff_id: "SYSTEM",
    is_combined_arrive: false,
    staff_note: `Rejected by client: ${input.reject_reason}${
      input.reject_note ? " — " + input.reject_note : ""
    }`,
    cancelled_at: null,
    cancelled_reason: null,
    createdAt: now,
  } as any);

  await logAudit({
    action: AUDIT_ACTIONS.unclaimed_rejected_by_client,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.unclaimed_inbound,
    target_id: unclaimed_id,
    details: {
      reject_reason: input.reject_reason,
      reject_note: input.reject_note ?? null,
    },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return { success: true };
}

// ── client pending-confirm tab list ─────────────────────────

export async function listPendingConfirmForClient(client_id: string) {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .find({
      status: "pending_assignment",
      assignment_history: {
        $elemMatch: {
          client_id,
          accepted_at: null,
          rejected_at: null,
          cancelled_at: null,
        },
      },
    })
    .toArray();
  return docs.map((d: any) => ({
    _id: d._id,
    carrier_inbound_code: d.carrier_inbound_code,
    tracking_no: d.tracking_no,
    weight: d.weight,
    dimension: d.dimension,
    photo_paths: d.photo_paths ?? [],
    staff_note: d.staff_note,
    arrived_at: d.arrived_at,
  }));
}

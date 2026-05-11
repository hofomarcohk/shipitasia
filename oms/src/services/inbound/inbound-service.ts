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
import { validateCategoryPair } from "@/services/inbound/master-data";
import {
  CreateInboundInput,
  CreateInboundInputSchema,
  InboundDeclaredItemInput,
  InboundDeclaredItemPublic,
  InboundRequestV1Public,
  InboundStatusV1,
  UpdateInboundInput,
  UpdateInboundInputSchema,
  normalizeTrackingNo,
  projectDeclaredItem,
  projectInboundV1,
} from "@/types/InboundV1";
import { ObjectId } from "mongodb";
import { z } from "zod";

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

// ── helpers ────────────────────────────────────────────────

async function lookupWarehouse(db: any, warehouseCode: string) {
  const w = await db
    .collection(collections.WAREHOUSE)
    .findOne({ warehouseCode, status: "active" });
  if (!w) throw new ApiError("WAREHOUSE_NOT_FOUND");
  return w;
}

async function lookupCarrierInbound(db: any, code: string) {
  const c = await db
    .collection(collections.CARRIER_INBOUND)
    .findOne({ carrier_inbound_code: code, status: "active" });
  if (!c) throw new ApiError("CARRIER_INBOUND_NOT_FOUND");
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
    .findOne({
      _id: oid,
      client_id,
      status: "active",
      deleted_at: null,
    });
  if (!a) throw new ApiError("INVALID_CARRIER_ACCOUNT");
  return a;
}

async function validateDeclaredItems(items: InboundDeclaredItemInput[]) {
  for (const it of items) {
    const ok = await validateCategoryPair(it.category_id, it.subcategory_id);
    if (!ok) throw new ApiError("INVALID_SUBCATEGORY");
  }
}

function buildSubtotal(it: InboundDeclaredItemInput): number {
  return it.quantity * it.unit_price;
}

// ── duplicate-check (used by route + onBlur) ────────────────

export async function checkTrackingDuplicate(
  client_id: string,
  carrier_inbound_code: string,
  tracking_no: string
): Promise<{ duplicated: boolean; duplicated_inbound_id: string | null }> {
  const db = await connectToDatabase();
  const normalized = normalizeTrackingNo(tracking_no);
  if (!normalized) {
    return { duplicated: false, duplicated_inbound_id: null };
  }
  const dup = await db.collection(collections.INBOUND).findOne({
    client_id,
    carrier_inbound_code,
    tracking_no_normalized: normalized,
    status: { $ne: "cancelled" },
  });
  return {
    duplicated: !!dup,
    duplicated_inbound_id: dup ? String(dup._id) : null,
  };
}

// ── create ─────────────────────────────────────────────────

interface CreateOptions {
  created_by_staff_id?: string; // set when admin creates on behalf
}

export async function createInbound(
  raw: unknown,
  ctx: ClientContext,
  opts: CreateOptions = {}
): Promise<{ inbound_id: string }> {
  const input = CreateInboundInputSchema.parse(raw);

  if (input.declared_items.length > 50) {
    throw new ApiError("TOO_MANY_DECLARED_ITEMS");
  }
  await validateDeclaredItems(input.declared_items);

  const db = await connectToDatabase();
  const warehouse = await lookupWarehouse(db, input.warehouseCode);
  await lookupCarrierInbound(db, input.carrier_inbound_code);

  // Single shipping carrier account ownership check
  let carrierAccount: any = null;
  if (input.shipment_type === "single") {
    if (!input.single_shipping) {
      throw new ApiError("SINGLE_SHIPPING_REQUIRED_FIELDS_MISSING");
    }
    carrierAccount = await lookupClientCarrierAccount(
      db,
      ctx.client_id,
      input.single_shipping.carrier_account_id
    );
  } else if (input.single_shipping) {
    throw new ApiError("SHIPPING_INFO_NOT_ALLOWED_FOR_CONSOLIDATED");
  }

  // tracking dedupe (against active inbounds)
  const tracking_no_normalized = normalizeTrackingNo(input.tracking_no);
  const dup = await db.collection(collections.INBOUND).findOne({
    client_id: ctx.client_id,
    carrier_inbound_code: input.carrier_inbound_code,
    tracking_no_normalized,
    status: { $ne: "cancelled" },
  });
  if (dup) throw new ApiError("TRACKING_NO_DUPLICATED");

  const inbound_id = await nextDailyId("I");
  const declared_value_total = input.declared_items.reduce(
    (s, it) => s + buildSubtotal(it),
    0
  );

  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      await db.collection(collections.INBOUND).insertOne(
        {
          _id: inbound_id as any,
          client_id: ctx.client_id,
          warehouseCode: input.warehouseCode,
          carrier_inbound_code: input.carrier_inbound_code,
          tracking_no: input.tracking_no,
          tracking_no_normalized,
          tracking_no_other:
            input.carrier_inbound_code === "other" && input.tracking_no_other
              ? input.tracking_no_other
              : null,
          inbound_source: input.inbound_source,
          size_estimate: input.size_estimate,
          size_estimate_note: input.size_estimate_note ?? null,
          contains_liquid: input.contains_liquid,
          contains_battery: input.contains_battery,
          shipment_type: input.shipment_type,
          single_shipping: input.single_shipping ?? null,
          customer_remarks: input.customer_remarks ?? null,
          declared_value_total,
          declared_currency: warehouse.declared_currency ?? "JPY",
          declared_items_count: input.declared_items.length,
          status: "pending",
          cancelled_at: null,
          cancelled_by_client: null,
          cancel_reason: null,
          abandoned_at: null,
          abandoned_by_client: null,
          abandoned_by_staff_id: null,
          abandoned_reason: null,
          abandon_warning_sent_at: null,
          arrivedAt: null,
          receivedAt: null,
          actualWeight: null,
          actualDimension: null,
          ...(opts.created_by_staff_id
            ? { created_by_staff_id: opts.created_by_staff_id }
            : {}),
          createdAt: now,
          updatedAt: now,
        } as any,
        { session }
      );

      // Insert declared_items (1 → N rows)
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
          currency: warehouse.declared_currency ?? "JPY",
          subtotal: buildSubtotal(it),
          display_order: i,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        { session }
      );

      // Update default shipping address if requested
      if (
        input.shipment_type === "single" &&
        input.save_as_default_address &&
        input.single_shipping
      ) {
        await db
          .collection(collections.CLIENT)
          .updateOne(
            { _id: new ObjectId(ctx.client_id) },
            {
              $set: {
                default_shipping_address: input.single_shipping.receiver_address,
                updatedAt: new Date(),
              },
            },
            { session }
          );
      }

      // notification
      await createNotification({
        client_id: ctx.client_id,
        type: "inbound_created",
        title: "預報建立成功",
        body: `預報 ${inbound_id} 已建立，等待到貨`,
        reference_type: "inbound",
        reference_id: inbound_id,
        action_url: `/zh-hk/inbound/${inbound_id}`,
      });
    });
  } finally {
    await session.endSession();
  }

  await logAudit({
    action: opts.created_by_staff_id
      ? AUDIT_ACTIONS.admin_inbound_created_for_client
      : AUDIT_ACTIONS.inbound_created,
    actor_type: opts.created_by_staff_id
      ? AUDIT_ACTOR_TYPES.admin
      : AUDIT_ACTOR_TYPES.client,
    actor_id: opts.created_by_staff_id ?? ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: inbound_id,
    details: {
      warehouseCode: input.warehouseCode,
      carrier_inbound_code: input.carrier_inbound_code,
      shipment_type: input.shipment_type,
      declared_items_count: input.declared_items.length,
      declared_value_total,
    },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return { inbound_id };
}

// ── list / get ─────────────────────────────────────────────

export interface ListOptions {
  status?: string[];
  page?: number;
  page_size?: number;
}

/**
 * Staff-wide inbound list for the desktop "入庫總覽" page. No client_id
 * filter; warehouse defaults to the staff's assigned warehouse.
 */
export async function listAllInboundsForStaff(params: {
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
      { carrier_inbound_code: { $regex: q, $options: "i" } },
    ];
  }
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;
  const total = await db.collection(collections.INBOUND).countDocuments(filter);
  const docs = await db
    .collection(collections.INBOUND)
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  return { items: docs.map(projectInboundV1), total };
}

export async function listMyInbounds(
  ctx: ClientContext,
  options: ListOptions = {}
): Promise<{ items: InboundRequestV1Public[]; total: number; page: number; page_size: number }> {
  const db = await connectToDatabase();
  const filter: Record<string, unknown> = { client_id: ctx.client_id };
  if (options.status && options.status.length > 0) {
    filter.status = { $in: options.status };
  }
  const page = options.page ?? 1;
  const page_size = Math.min(options.page_size ?? 50, 200);
  const total = await db.collection(collections.INBOUND).countDocuments(filter);
  const docs = await db
    .collection(collections.INBOUND)
    .find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * page_size)
    .limit(page_size)
    .toArray();
  return {
    items: docs.map(projectInboundV1),
    total,
    page,
    page_size,
  };
}

export async function getMyInbound(
  id: string,
  ctx: ClientContext
): Promise<{
  inbound: InboundRequestV1Public;
  declared_items: InboundDeclaredItemPublic[];
}> {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.INBOUND)
    .findOne({ _id: id as any, client_id: ctx.client_id });
  if (!doc) throw new ApiError("INBOUND_NOT_FOUND");
  const items = await db
    .collection(collections.INBOUND_DECLARED_ITEM)
    .find({ inbound_request_id: id })
    .sort({ display_order: 1 })
    .toArray();
  return {
    inbound: projectInboundV1(doc),
    declared_items: items.map(projectDeclaredItem),
  };
}

// ── update (pending only) ──────────────────────────────────

export async function updateInbound(
  id: string,
  raw: unknown,
  ctx: ClientContext
) {
  const input = UpdateInboundInputSchema.parse(raw);
  const db = await connectToDatabase();
  const before = await db
    .collection(collections.INBOUND)
    .findOne({ _id: id as any, client_id: ctx.client_id });
  if (!before) throw new ApiError("INBOUND_NOT_FOUND");
  if (before.status !== "pending") {
    throw new ApiError("CANNOT_EDIT_AFTER_ARRIVED");
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  const fields = [
    "warehouseCode",
    "carrier_inbound_code",
    "inbound_source",
    "size_estimate",
    "size_estimate_note",
    "contains_liquid",
    "contains_battery",
    "shipment_type",
    "single_shipping",
    "customer_remarks",
  ] as const;
  for (const k of fields) {
    if ((input as any)[k] !== undefined) set[k] = (input as any)[k];
  }

  // tracking_no change → recompute normalized + dedupe-check
  if (input.tracking_no && input.tracking_no !== before.tracking_no) {
    const normalized = normalizeTrackingNo(input.tracking_no);
    const dup = await db.collection(collections.INBOUND).findOne({
      _id: { $ne: id as any },
      client_id: ctx.client_id,
      carrier_inbound_code: input.carrier_inbound_code ?? before.carrier_inbound_code,
      tracking_no_normalized: normalized,
      status: { $ne: "cancelled" },
    });
    if (dup) throw new ApiError("TRACKING_NO_DUPLICATED");
    set.tracking_no = input.tracking_no;
    set.tracking_no_normalized = normalized;
  }

  // declared_items replace + recompute value
  let newItemsCount = before.declared_items_count;
  let newValueTotal = before.declared_value_total;
  if (input.declared_items) {
    if (input.declared_items.length > 50) {
      throw new ApiError("TOO_MANY_DECLARED_ITEMS");
    }
    await validateDeclaredItems(input.declared_items);
  }

  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      if (input.declared_items) {
        await db
          .collection(collections.INBOUND_DECLARED_ITEM)
          .deleteMany({ inbound_request_id: id }, { session });
        const warehouse = await db
          .collection(collections.WAREHOUSE)
          .findOne({ warehouseCode: input.warehouseCode ?? before.warehouseCode }, { session });
        const currency = warehouse?.declared_currency ?? before.declared_currency ?? "JPY";
        await db.collection(collections.INBOUND_DECLARED_ITEM).insertMany(
          input.declared_items.map((it, i) => ({
            inbound_request_id: id,
            client_id: ctx.client_id,
            category_id: it.category_id,
            subcategory_id: it.subcategory_id,
            product_name: it.product_name,
            product_url: it.product_url ?? null,
            quantity: it.quantity,
            unit_price: it.unit_price,
            currency,
            subtotal: buildSubtotal(it),
            display_order: i,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
          { session }
        );
        newItemsCount = input.declared_items.length;
        newValueTotal = input.declared_items.reduce(
          (s, it) => s + buildSubtotal(it),
          0
        );
        set.declared_items_count = newItemsCount;
        set.declared_value_total = newValueTotal;
      }

      await db
        .collection(collections.INBOUND)
        .updateOne({ _id: id as any }, { $set: set }, { session });

      await createNotification({
        client_id: ctx.client_id,
        type: "inbound_updated",
        title: "預報已更新",
        body: `預報 ${id} 已更新`,
        reference_type: "inbound",
        reference_id: id,
        action_url: `/zh-hk/inbound/${id}`,
      });
    });
  } finally {
    await session.endSession();
  }

  await logAudit({
    action: AUDIT_ACTIONS.inbound_updated,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: id,
    details: { fields: Object.keys(input) },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return await getMyInbound(id, ctx);
}

// ── cancel ─────────────────────────────────────────────────

export const CancelInputSchema = z
  .object({
    cancel_reason: z.string().max(500).optional(),
  })
  .strict();

export async function cancelInbound(
  id: string,
  raw: unknown,
  ctx: ClientContext
) {
  const input = CancelInputSchema.parse(raw ?? {});
  const db = await connectToDatabase();
  // Atomic: flip pending → cancelled. Also $unset tracking_no_normalized so
  // the unique partial index no longer collides with a future re-register.
  const result = await db.collection(collections.INBOUND).findOneAndUpdate(
    { _id: id as any, client_id: ctx.client_id, status: "pending" },
    {
      $set: {
        status: "cancelled",
        cancelled_at: new Date(),
        cancelled_by_client: true,
        cancel_reason: input.cancel_reason ?? null,
        updatedAt: new Date(),
      },
      $unset: { tracking_no_normalized: "" },
    },
    { returnDocument: "after" }
  );
  const updated =
    result && (result as any).value !== undefined
      ? (result as any).value
      : result;
  if (!updated) {
    const existing = await db
      .collection(collections.INBOUND)
      .findOne({ _id: id as any, client_id: ctx.client_id });
    if (!existing) throw new ApiError("INBOUND_NOT_FOUND");
    throw new ApiError("CANNOT_CANCEL_AFTER_ARRIVED");
  }

  await createNotification({
    client_id: ctx.client_id,
    type: "inbound_cancelled",
    title: "預報已取消",
    body: `預報 ${id} 已取消`,
    reference_type: "inbound",
    reference_id: id,
  });

  await logAudit({
    action: AUDIT_ACTIONS.inbound_cancelled,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: id,
    details: { cancel_reason: input.cancel_reason ?? null },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return projectInboundV1(updated);
}

// ── abandon (client) ───────────────────────────────────────

export const AbandonInputSchema = z
  .object({
    confirmation_text: z.string(),
  })
  .strict();

export async function abandonInbound(
  id: string,
  raw: unknown,
  ctx: ClientContext
) {
  const input = AbandonInputSchema.parse(raw);
  if (input.confirmation_text !== "廢棄") {
    throw new ApiError("ABANDON_CONFIRMATION_MISMATCH");
  }

  const db = await connectToDatabase();
  const result = await db.collection(collections.INBOUND).findOneAndUpdate(
    {
      _id: id as any,
      client_id: ctx.client_id,
      status: { $in: ["arrived", "received"] },
    },
    {
      $set: {
        status: "abandoned",
        abandoned_at: new Date(),
        abandoned_by_client: true,
        abandoned_reason: "客戶主動廢棄",
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );
  const updated =
    result && (result as any).value !== undefined
      ? (result as any).value
      : result;
  if (!updated) {
    const existing = await db
      .collection(collections.INBOUND)
      .findOne({ _id: id as any, client_id: ctx.client_id });
    if (!existing) throw new ApiError("INBOUND_NOT_FOUND");
    throw new ApiError("CANNOT_ABANDON_AFTER_PICKING");
  }

  await createNotification({
    client_id: ctx.client_id,
    type: "inbound_abandoned",
    title: "貨物已廢棄",
    body: `貨物 ${id} 已廢棄`,
    reference_type: "inbound",
    reference_id: id,
  });

  await logAudit({
    action: AUDIT_ACTIONS.inbound_abandoned_by_client,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: id,
    details: {},
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return projectInboundV1(updated);
}

// ── abandon (admin force) ──────────────────────────────────

export const AdminAbandonInputSchema = z
  .object({
    confirmation_text: z.string(),
    abandoned_reason: z.string().min(1).max(500),
  })
  .strict();

export async function adminAbandonInbound(
  id: string,
  raw: unknown,
  actor: AdminContext
) {
  const input = AdminAbandonInputSchema.parse(raw);
  if (input.confirmation_text !== "廢棄") {
    throw new ApiError("ABANDON_CONFIRMATION_MISMATCH");
  }
  const db = await connectToDatabase();
  const result = await db.collection(collections.INBOUND).findOneAndUpdate(
    {
      _id: id as any,
      status: { $in: ["arrived", "received"] },
    },
    {
      $set: {
        status: "abandoned",
        abandoned_at: new Date(),
        abandoned_by_client: false,
        abandoned_by_staff_id: actor.staff_id,
        abandoned_reason: input.abandoned_reason,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );
  const updated =
    result && (result as any).value !== undefined
      ? (result as any).value
      : result;
  if (!updated) {
    const existing = await db
      .collection(collections.INBOUND)
      .findOne({ _id: id as any });
    if (!existing) throw new ApiError("INBOUND_NOT_FOUND");
    throw new ApiError("CANNOT_ABANDON_AFTER_PICKING");
  }

  await createNotification({
    client_id: updated.client_id,
    type: "inbound_abandoned",
    title: "貨物已廢棄",
    body: `貨物 ${id} 已被廢棄：${input.abandoned_reason}`,
    reference_type: "inbound",
    reference_id: id,
  });

  await logAudit({
    action: AUDIT_ACTIONS.inbound_abandoned_by_admin,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: actor.staff_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: id,
    details: { abandoned_reason: input.abandoned_reason },
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return projectInboundV1(updated);
}

// ── admin read ─────────────────────────────────────────────

export interface AdminListOptions {
  status?: string;
  client_id?: string;
  page?: number;
  page_size?: number;
  search?: string;
}

export async function adminListInbounds(options: AdminListOptions = {}) {
  const db = await connectToDatabase();
  const filter: Record<string, unknown> = {};
  if (options.status) filter.status = options.status;
  if (options.client_id) filter.client_id = options.client_id;
  if (options.search) {
    const re = new RegExp(
      options.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
    filter.$or = [
      { _id: re },
      { tracking_no: re },
    ];
  }
  const page = options.page ?? 1;
  const page_size = Math.min(options.page_size ?? 50, 200);
  const total = await db.collection(collections.INBOUND).countDocuments(filter);
  const docs = await db
    .collection(collections.INBOUND)
    .find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * page_size)
    .limit(page_size)
    .toArray();
  return {
    items: docs.map(projectInboundV1),
    total,
    page,
    page_size,
  };
}

export async function adminGetInbound(id: string) {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.INBOUND)
    .findOne({ _id: id as any });
  if (!doc) throw new ApiError("INBOUND_NOT_FOUND");
  const items = await db
    .collection(collections.INBOUND_DECLARED_ITEM)
    .find({ inbound_request_id: id })
    .sort({ display_order: 1 })
    .toArray();
  return {
    inbound: projectInboundV1(doc),
    declared_items: items.map(projectDeclaredItem),
  };
}

// ── admin create-on-behalf (Bug 1 fix) ─────────────────────

export async function adminCreateInbound(
  raw: unknown,
  actor: AdminContext
): Promise<{ inbound_id: string }> {
  const Schema = CreateInboundInputSchema._def.schema
    ? z.object({
        client_id: z.string().min(1),
      }).passthrough()
    : z.object({ client_id: z.string().min(1) }).passthrough();
  const parsed = (raw ?? {}) as any;
  if (!parsed.client_id) {
    throw new ApiError("INVALID_CREDENTIALS", { details: "client_id required" });
  }
  // Re-use the same input validation as client path
  const { client_id, ...rest } = parsed;
  return await createInbound(
    rest,
    {
      client_id,
      ip_address: actor.ip_address,
      user_agent: actor.user_agent,
    },
    { created_by_staff_id: actor.staff_id }
  );
}

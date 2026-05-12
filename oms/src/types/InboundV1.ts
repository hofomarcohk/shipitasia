// Phase 4 v1 inbound types. The legacy `types/Inbound.ts` stays for inherited
// code paths until they're migrated phase-by-phase.

import { z } from "zod";

// ── warehouses (extended) ────────────────────────────────────

export const WarehouseSchema = z
  .object({
    warehouseCode: z.string().min(1),
    name_zh: z.string().min(1),
    name_en: z.string().min(1),
    country_code: z.string().length(2),
    declared_currency: z.string().length(3),
    address_zh: z.string().min(1),
    address_en: z.string().min(1),
    postal_code: z.string().min(1),
    contact_phone: z.string().min(1),
    scan_config: z.record(z.string(), z.unknown()).nullable().optional(),
    status: z.enum(["active", "disabled"]),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })
  .strict();
export type WarehouseV1 = z.infer<typeof WarehouseSchema>;

// ── carriers_inbound ────────────────────────────────────────

export const CarrierInboundSchema = z
  .object({
    carrier_inbound_code: z.string().min(1),
    name_zh: z.string().min(1),
    name_en: z.string().min(1),
    name_ja: z.string().nullable().optional(),
    country_code: z.string().length(2),
    tracking_format_hint: z.string().nullable().optional(),
    tracking_url_template: z.string().url().nullable().optional(),
    status: z.enum(["active", "disabled"]),
    sort_order: z.number().int().default(100),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })
  .strict();
export type CarrierInbound = z.infer<typeof CarrierInboundSchema>;

// ── product_categories (two-level tree) ─────────────────────

export const ProductCategorySchema = z
  .object({
    _id: z.string().min(1),
    parent_id: z.string().nullable(),
    name_zh: z.string().min(1),
    name_en: z.string().default(""),
    sort_order: z.number().int().default(100),
    status: z.enum(["active", "disabled"]),
  })
  .strict();
export type ProductCategory = z.infer<typeof ProductCategorySchema>;

// ── inbound enums ───────────────────────────────────────────

export const INBOUND_STATUS_V1 = [
  "pending",
  "arrived",
  "received",
  "picking",
  "packed",
  "palletized",
  "departed",
  "cancelled",
  "abandoned",
  "expired",
] as const;
export type InboundStatusV1 = (typeof INBOUND_STATUS_V1)[number];

export const INBOUND_SOURCE = [
  "regular",
  "return",
  "gift",
  "other",
] as const;
export type InboundSource = (typeof INBOUND_SOURCE)[number];

export const SIZE_ESTIMATE = ["small", "medium", "large"] as const;
export type SizeEstimate = (typeof SIZE_ESTIMATE)[number];

export const SHIPMENT_TYPE = ["consolidated", "single"] as const;
export type ShipmentType = (typeof SHIPMENT_TYPE)[number];

export const ReceiverAddressSchema = z
  .object({
    name: z.string().min(1).max(100),
    phone: z.string().min(1).max(40),
    country_code: z.string().length(2),
    city: z.string().min(1),
    district: z.string().optional(),
    address: z.string().min(1),
    postal_code: z.string().optional(),
  })
  .strict();
export type ReceiverAddress = z.infer<typeof ReceiverAddressSchema>;

export const SingleShippingSchema = z
  .object({
    receiver_address: ReceiverAddressSchema,
    carrier_account_id: z.string().min(1),
  })
  .strict();

export const ActualDimensionSchema = z
  .object({
    length: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

// ── declared item input + projection ────────────────────────

export const InboundDeclaredItemInputSchema = z
  .object({
    category_id: z.string().min(1),
    subcategory_id: z.string().min(1),
    product_name: z.string().min(1).max(200).trim(),
    product_url: z
      .string()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined))
      .refine((v) => v === undefined || /^https?:\/\//.test(v), {
        message: "must start with http:// or https://",
      }),
    quantity: z.coerce.number().int().positive(),
    unit_price: z.coerce.number().nonnegative(),
    // Per the v0.3 item-dialog redesign: every commit silently upserts
    // the row into the customer's saved-item library, keyed by
    // normalize(product_name). This flag is the explicit opt-out for
    // one-off items the customer doesn't want auto-saved.
    opt_out_library: z.boolean().optional(),
  })
  .strict();
export type InboundDeclaredItemInput = z.infer<typeof InboundDeclaredItemInputSchema>;

// ── client-facing create input ──────────────────────────────

export const CreateInboundInputSchema = z
  .object({
    warehouseCode: z.string().min(1),
    carrier_inbound_code: z.string().min(1),
    tracking_no: z.string().min(1).max(100).trim(),
    tracking_no_other: z.string().max(100).trim().optional(),
    inbound_source: z.enum(INBOUND_SOURCE),
    size_estimate: z.enum(SIZE_ESTIMATE),
    size_estimate_note: z.string().max(100).trim().optional(),
    contains_liquid: z.boolean(),
    contains_battery: z.boolean(),
    shipment_type: z.enum(SHIPMENT_TYPE),
    single_shipping: SingleShippingSchema.optional(),
    save_as_default_address: z.boolean().optional(),
    customer_remarks: z.string().max(200).trim().optional(),
    declared_items: InboundDeclaredItemInputSchema.array().min(1).max(50),
  })
  .strict()
  .refine(
    (d) => d.shipment_type === "consolidated" || d.single_shipping !== undefined,
    { message: "single_shipping required when shipment_type=single", path: ["single_shipping"] }
  )
  .refine(
    (d) => d.shipment_type === "single" || d.single_shipping === undefined,
    { message: "single_shipping must be empty when shipment_type=consolidated", path: ["single_shipping"] }
  );
export type CreateInboundInput = z.infer<typeof CreateInboundInputSchema>;

// Update schema — same fields but everything optional so PATCH can supply
// a subset. Defined separately because zod .partial() doesn't compose with
// .refine() the way the create schema needs.
export const UpdateInboundInputSchema = z
  .object({
    warehouseCode: z.string().min(1).optional(),
    carrier_inbound_code: z.string().min(1).optional(),
    tracking_no: z.string().min(1).max(100).trim().optional(),
    tracking_no_other: z.string().max(100).trim().optional(),
    inbound_source: z.enum(INBOUND_SOURCE).optional(),
    size_estimate: z.enum(SIZE_ESTIMATE).optional(),
    size_estimate_note: z.string().max(100).trim().optional(),
    contains_liquid: z.boolean().optional(),
    contains_battery: z.boolean().optional(),
    shipment_type: z.enum(SHIPMENT_TYPE).optional(),
    single_shipping: SingleShippingSchema.nullable().optional(),
    save_as_default_address: z.boolean().optional(),
    customer_remarks: z.string().max(200).trim().optional(),
    declared_items: InboundDeclaredItemInputSchema.array().min(1).max(50).optional(),
  })
  .strict();
export type UpdateInboundInput = z.infer<typeof UpdateInboundInputSchema>;

// ── projections ─────────────────────────────────────────────

export interface InboundRequestV1Public {
  _id: string;
  client_id: string;
  warehouseCode: string;
  carrier_inbound_code: string;
  tracking_no: string;
  tracking_no_other: string | null;
  inbound_source: InboundSource;
  size_estimate: SizeEstimate;
  size_estimate_note: string | null;
  contains_liquid: boolean;
  contains_battery: boolean;
  shipment_type: ShipmentType;
  single_shipping:
    | { receiver_address: ReceiverAddress; carrier_account_id: string }
    | null;
  customer_remarks: string | null;
  declared_value_total: number;
  declared_currency: string;
  declared_items_count: number;
  status: InboundStatusV1;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  abandoned_at: Date | null;
  abandoned_reason: string | null;
  arrivedAt: Date | null;
  receivedAt: Date | null;
  actualWeight: number | null;
  actualDimension: { length: number; width: number; height: number } | null;
  createdAt: Date;
  updatedAt: Date;
}

export function projectInboundV1(doc: any): InboundRequestV1Public {
  return {
    _id: doc._id,
    client_id: doc.client_id,
    warehouseCode: doc.warehouseCode,
    carrier_inbound_code: doc.carrier_inbound_code,
    tracking_no: doc.tracking_no,
    tracking_no_other: doc.tracking_no_other ?? null,
    inbound_source: doc.inbound_source,
    size_estimate: doc.size_estimate,
    size_estimate_note: doc.size_estimate_note ?? null,
    contains_liquid: !!doc.contains_liquid,
    contains_battery: !!doc.contains_battery,
    shipment_type: doc.shipment_type,
    single_shipping: doc.single_shipping ?? null,
    customer_remarks: doc.customer_remarks ?? null,
    declared_value_total: doc.declared_value_total ?? 0,
    declared_currency: doc.declared_currency ?? "JPY",
    declared_items_count: doc.declared_items_count ?? 0,
    status: doc.status,
    cancelled_at: doc.cancelled_at ?? null,
    cancel_reason: doc.cancel_reason ?? null,
    abandoned_at: doc.abandoned_at ?? null,
    abandoned_reason: doc.abandoned_reason ?? null,
    arrivedAt: doc.arrivedAt ?? null,
    receivedAt: doc.receivedAt ?? null,
    actualWeight: doc.actualWeight ?? null,
    actualDimension: doc.actualDimension ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface InboundDeclaredItemPublic {
  _id: string;
  category_id: string;
  subcategory_id: string;
  product_name: string;
  product_url: string | null;
  quantity: number;
  unit_price: number;
  currency: string;
  subtotal: number;
  display_order: number;
}

export function projectDeclaredItem(doc: any): InboundDeclaredItemPublic {
  return {
    _id: doc._id?.toString(),
    category_id: doc.category_id,
    subcategory_id: doc.subcategory_id,
    product_name: doc.product_name,
    product_url: doc.product_url ?? null,
    quantity: doc.quantity,
    unit_price: doc.unit_price,
    currency: doc.currency ?? "JPY",
    subtotal: doc.subtotal,
    display_order: doc.display_order ?? 0,
  };
}

// ── notifications ──────────────────────────────────────────

export const NotificationSchema = z
  .object({
    client_id: z.string().min(1),
    type: z.string().min(1),
    title: z.string().min(1),
    body: z.string(),
    reference_type: z.string().nullable().optional(),
    reference_id: z.string().nullable().optional(),
    action_url: z.string().nullable().optional(),
    is_read: z.boolean().default(false),
    read_at: z.date().nullable().optional(),
    createdAt: z.date(),
  })
  .strict();
export type NotificationV1 = z.infer<typeof NotificationSchema>;

// ── trackingNo normalize (Phase 4 §1.2.3 + 7.4) ──────────────

export function normalizeTrackingNo(raw: string): string {
  return raw.replace(/-/g, "").replace(/\s/g, "").toUpperCase();
}

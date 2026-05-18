// Phase 7 v1 outbound types. Keeps separate from legacy `types/Outbound.ts`
// to allow the inherited code paths to coexist during the cut-over.

import { z } from "zod";
import { ReceiverAddressSchema } from "@/types/InboundV1";

// ── enums ────────────────────────────────────────────────────

export const OUTBOUND_STATUS_V1 = [
  "held",
  "ready_for_label",
  "picking",
  "picked",
  "packing",
  "packed",
  "weighing",
  "weight_verified",
  "pending_client_label",
  "label_obtaining",
  "label_obtained",
  "label_printed",
  "departed",
  "cancelled",
  "cancelled_after_label",
] as const;
export type OutboundStatusV1 = (typeof OUTBOUND_STATUS_V1)[number];

export const OUTBOUND_HELD_REASON = [
  "insufficient_balance",
  "phase7_not_ready",
  "awaiting_client_input",
  "label_failed_retry",
  "carrier_auth_failed",
  "capacity_violation",
  "carrier_api_failed",
] as const;
export type OutboundHeldReason = (typeof OUTBOUND_HELD_REASON)[number];

export const OUTBOUND_PROCESSING_PREFERENCE = [
  "auto",
  "confirm_before_label",
] as const;
export type OutboundProcessingPreference =
  (typeof OUTBOUND_PROCESSING_PREFERENCE)[number];

export const OUTBOUND_SHIPMENT_TYPE = ["consolidated", "single"] as const;
export type OutboundShipmentType = (typeof OUTBOUND_SHIPMENT_TYPE)[number];

// ── rate quote breakdown ─────────────────────────────────────

export const RateQuoteBreakdownSchema = z
  .object({
    carrier_code: z.string().min(1),
    base_fee: z.number().nonnegative(),
    per_kg_fee: z.number().nonnegative(),
    weight_kg: z.number().nonnegative(),
    country_multiplier: z.number().positive(),
    carrier_multiplier: z.number().positive(),
    surcharge: z.number().default(0),
    total: z.number().nonnegative(),
    currency: z.literal("HKD"),
  })
  .strict();
export type RateQuoteBreakdown = z.infer<typeof RateQuoteBreakdownSchema>;

// ── outbound_requests document ───────────────────────────────

export const OutboundRequestV1Schema = z
  .object({
    _id: z.string().min(1), // e.g. OUT-YYYYMMDD-NNNN
    client_id: z.string().min(1),
    warehouseCode: z.string().min(1),
    shipment_type: z.enum(OUTBOUND_SHIPMENT_TYPE),

    // links to inbound requests (also denormalized as count for cheap reads)
    inbound_count: z.number().int().nonnegative(),

    // carrier + service
    carrier_code: z.string().min(1),
    carrier_account_id: z.string().nullable(), // null until selected for non-default carriers
    service_code: z.string().nullable().optional(),
    destination_country: z.string().length(2),
    receiver_address: ReceiverAddressSchema,

    // processing
    processing_preference: z.enum(OUTBOUND_PROCESSING_PREFERENCE),

    // status state machine
    status: z.enum(OUTBOUND_STATUS_V1),
    held_reason: z.enum(OUTBOUND_HELD_REASON).nullable(),
    held_since: z.date().nullable(),
    held_detail: z.string().nullable(),

    // weight + dimension (filled by WMS in P8)
    declared_weight_kg: z.number().nonnegative().nullable(),
    actual_weight_kg: z.number().nonnegative().nullable(),
    actual_dimension: z
      .object({
        length: z.number().int().positive(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .nullable(),

    // rate quote (last successful quote at creation; recomputed on weight verify)
    rate_quote: RateQuoteBreakdownSchema.nullable(),
    quoted_amount_hkd: z.number().nonnegative().nullable(),

    // label
    label_url: z.string().nullable(),
    label_obtained_at: z.date().nullable(),
    tracking_no: z.string().nullable(),

    // departure (set in P8)
    departed_at: z.date().nullable(),

    // cancellation
    cancelled_at: z.date().nullable(),
    cancel_reason: z.string().nullable(),
    cancelled_by_actor_type: z.string().nullable(),

    // client-supplied
    customer_remarks: z.string().max(500).nullable(),

    // P10 — pick batch assignment + consolidation opt-out + derived cargo
    // categories (used by OMS to render the opt-out hint to the client).
    batch_id: z.string().nullable().optional(),
    disallow_consolidation: z.boolean().default(false).optional(),
    cargo_categories: z.array(z.string()).default([]).optional(),

    // P13 — label batch grouping. Set when this outbound was fetched via a
    // multi-outbound 合併取單 request. Null/absent for single-fetch outbounds.
    label_batch_id: z.string().nullable().optional(),

    // P12 — 秤重置板 denormalized box list (cm + kg) written on palletize
    // complete so OMS / label-print phase can read shipping dimensions without
    // hitting pack_boxes_v1. Additive optional; legacy reads safe.
    boxes: z
      .array(
        z
          .object({
            box_no: z.string().min(1),
            length: z.number().nonnegative(),
            width: z.number().nonnegative(),
            height: z.number().nonnegative(),
            weight: z.number().nonnegative(),
            tracking_no: z.string().nullable().optional(),
            sealed_at: z.date().nullable().optional(),
          })
          .strict()
      )
      .optional(),
    palletized_at: z.date().nullable().optional(),

    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
export type OutboundRequestV1 = z.infer<typeof OutboundRequestV1Schema>;

// ── outbound_inbound_links (N:N intermediary) ────────────────

export const OutboundInboundLinkSchema = z
  .object({
    outbound_id: z.string().min(1),
    inbound_id: z.string().min(1),
    client_id: z.string().min(1),
    linked_at: z.date(),
    unlinked_at: z.date().nullable(), // null = active
    unlink_reason: z.string().nullable(),
  })
  .strict();
export type OutboundInboundLink = z.infer<typeof OutboundInboundLinkSchema>;

// ── outbound_action_logs (append-only) ───────────────────────

export const OUTBOUND_ACTION = [
  "created",
  "held",
  "released",
  "rate_quoted",
  "balance_reserved",
  "label_requested",
  "label_obtained",
  "label_failed",
  "cancelled",
  "single_completed",
] as const;
export type OutboundAction = (typeof OUTBOUND_ACTION)[number];

export const OutboundActionLogSchema = z
  .object({
    outbound_id: z.string().min(1),
    client_id: z.string().min(1),
    action: z.enum(OUTBOUND_ACTION),
    from_status: z.enum(OUTBOUND_STATUS_V1).nullable(),
    to_status: z.enum(OUTBOUND_STATUS_V1).nullable(),
    actor_type: z.enum(["client", "admin", "system", "staff"]),
    actor_id: z.string().nullable(),
    detail: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.date(),
  })
  .strict();
export type OutboundActionLog = z.infer<typeof OutboundActionLogSchema>;

// ── rate_quote_logs (per ICarrierAdapter call) ───────────────

export const RateQuoteLogSchema = z
  .object({
    outbound_id: z.string().min(1).nullable(), // null = preview before outbound created
    client_id: z.string().min(1),
    carrier_code: z.string().min(1),
    destination_country: z.string().length(2),
    weight_kg: z.number().nonnegative(),
    breakdown: RateQuoteBreakdownSchema.nullable(),
    success: z.boolean(),
    error_code: z.string().nullable(),
    error_message: z.string().nullable(),
    latency_ms: z.number().int().nonnegative(),
    createdAt: z.date(),
  })
  .strict();
export type RateQuoteLog = z.infer<typeof RateQuoteLogSchema>;

// ── client-facing create inputs ──────────────────────────────

export const CreateConsolidatedOutboundInputSchema = z
  .object({
    inbound_ids: z.string().min(1).array().min(1).max(100),
    carrier_code: z.string().min(1),
    carrier_account_id: z.string().nullable().optional(),
    service_code: z.string().optional(),
    receiver_address: ReceiverAddressSchema,
    processing_preference: z.enum(OUTBOUND_PROCESSING_PREFERENCE),
    customer_remarks: z.string().max(500).optional(),
    // P10 — opt-out of cross-outbound consolidation (Phase B feature).
    disallow_consolidation: z.boolean().optional(),
  })
  .strict();
export type CreateConsolidatedOutboundInput = z.infer<
  typeof CreateConsolidatedOutboundInputSchema
>;

export const CreateSingleOutboundInputSchema = z
  .object({
    inbound_id: z.string().min(1),
    carrier_code: z.string().min(1),
    carrier_account_id: z.string().nullable().optional(),
    service_code: z.string().optional(),
    receiver_address: ReceiverAddressSchema,
    customer_remarks: z.string().max(500).optional(),
    disallow_consolidation: z.boolean().optional(),
  })
  .strict();
export type CreateSingleOutboundInput = z.infer<
  typeof CreateSingleOutboundInputSchema
>;

export const RateQuotePreviewInputSchema = z
  .object({
    carrier_code: z.string().min(1),
    destination_country: z.string().length(2),
    weight_kg: z.number().positive(),
  })
  .strict();
export type RateQuotePreviewInput = z.infer<typeof RateQuotePreviewInputSchema>;

// ── projections ──────────────────────────────────────────────

export interface OutboundRequestV1Public {
  _id: string;
  client_id: string;
  warehouseCode: string;
  shipment_type: OutboundShipmentType;
  inbound_count: number;
  carrier_code: string;
  carrier_account_id: string | null;
  service_code: string | null;
  destination_country: string;
  receiver_address: {
    name: string;
    phone: string;
    country_code: string;
    city: string;
    district?: string;
    address: string;
    postal_code?: string;
  };
  processing_preference: OutboundProcessingPreference;
  status: OutboundStatusV1;
  held_reason: OutboundHeldReason | null;
  held_since: Date | null;
  held_detail: string | null;
  declared_weight_kg: number | null;
  actual_weight_kg: number | null;
  actual_dimension: { length: number; width: number; height: number } | null;
  rate_quote: RateQuoteBreakdown | null;
  quoted_amount_hkd: number | null;
  label_url: string | null;
  label_obtained_at: Date | null;
  tracking_no: string | null;
  departed_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  customer_remarks: string | null;
  batch_id: string | null;
  disallow_consolidation: boolean;
  cargo_categories: string[];
  label_batch_id: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function projectOutboundV1(doc: any): OutboundRequestV1Public {
  return {
    _id: String(doc._id),
    client_id: doc.client_id,
    warehouseCode: doc.warehouseCode,
    shipment_type: doc.shipment_type,
    inbound_count: doc.inbound_count ?? 0,
    carrier_code: doc.carrier_code,
    carrier_account_id: doc.carrier_account_id ?? null,
    service_code: doc.service_code ?? null,
    destination_country: doc.destination_country,
    receiver_address: doc.receiver_address,
    processing_preference: doc.processing_preference,
    status: doc.status,
    held_reason: doc.held_reason ?? null,
    held_since: doc.held_since ?? null,
    held_detail: doc.held_detail ?? null,
    declared_weight_kg: doc.declared_weight_kg ?? null,
    actual_weight_kg: doc.actual_weight_kg ?? null,
    actual_dimension: doc.actual_dimension ?? null,
    rate_quote: doc.rate_quote ?? null,
    quoted_amount_hkd: doc.quoted_amount_hkd ?? null,
    label_url: doc.label_url ?? null,
    label_obtained_at: doc.label_obtained_at ?? null,
    tracking_no: doc.tracking_no ?? null,
    departed_at: doc.departed_at ?? null,
    cancelled_at: doc.cancelled_at ?? null,
    cancel_reason: doc.cancel_reason ?? null,
    customer_remarks: doc.customer_remarks ?? null,
    batch_id: doc.batch_id ?? null,
    disallow_consolidation: !!doc.disallow_consolidation,
    cargo_categories: doc.cargo_categories ?? [],
    label_batch_id: doc.label_batch_id ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// admin projection — exposes ip / actor metadata on cancellations etc.
export interface OutboundRequestV1Admin extends OutboundRequestV1Public {
  cancelled_by_actor_type: string | null;
}

export function projectOutboundV1Admin(doc: any): OutboundRequestV1Admin {
  return {
    ...projectOutboundV1(doc),
    cancelled_by_actor_type: doc.cancelled_by_actor_type ?? null,
  };
}

// ── Phase 8: per-box schema ──────────────────────────────────

export const OUTBOUND_BOX_STATUS = [
  "packing",
  "packed",
  "weight_verified",
  "label_obtained",
  "label_printed",
  "departed",
] as const;
export type OutboundBoxStatus = (typeof OUTBOUND_BOX_STATUS)[number];

export const OutboundBoxDimensionsSchema = z
  .object({
    length: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export type OutboundBoxDimensions = z.infer<typeof OutboundBoxDimensionsSchema>;

export const OutboundBoxSchema = z
  .object({
    _id: z.string().min(1),
    outbound_id: z.string().min(1),
    box_no: z.string().min(1), // B-{out_id_short}-NN
    dimensions: OutboundBoxDimensionsSchema,
    weight_estimate: z.number().positive(),
    weight_actual: z.number().positive().nullable(),
    tare_weight: z.number().nonnegative().nullable(),
    weight_diff: z.number().nullable(),
    weight_diff_passed: z.boolean().nullable(),
    status: z.enum(OUTBOUND_BOX_STATUS),
    label_pdf_path: z.string().nullable(),
    tracking_no_carrier: z.string().nullable(),
    actual_label_fee: z.number().nonnegative().nullable(),
    label_obtained_at: z.date().nullable(),
    label_obtained_by_operator_type: z
      .enum(["system", "client", "admin", "wms_staff"])
      .nullable(),
    departed_at: z.date().nullable(),
    pallet_label_id: z.string().nullable().optional(),
    created_by_staff_id: z.string().min(1),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
export type OutboundBox = z.infer<typeof OutboundBoxSchema>;

export interface OutboundBoxPublic {
  _id: string;
  outbound_id: string;
  box_no: string;
  dimensions: OutboundBoxDimensions;
  weight_estimate: number;
  weight_actual: number | null;
  tare_weight: number | null;
  weight_diff: number | null;
  weight_diff_passed: boolean | null;
  status: OutboundBoxStatus;
  label_pdf_path: string | null;
  tracking_no_carrier: string | null;
  actual_label_fee: number | null;
  label_obtained_at: Date | null;
  departed_at: Date | null;
  pallet_label_id: string | null;
  createdAt: Date;
}

export function projectOutboundBox(doc: any): OutboundBoxPublic {
  return {
    _id: String(doc._id),
    outbound_id: doc.outbound_id,
    box_no: doc.box_no,
    dimensions: doc.dimensions,
    weight_estimate: doc.weight_estimate,
    weight_actual: doc.weight_actual ?? null,
    tare_weight: doc.tare_weight ?? null,
    weight_diff: doc.weight_diff ?? null,
    weight_diff_passed: doc.weight_diff_passed ?? null,
    status: doc.status,
    label_pdf_path: doc.label_pdf_path ?? null,
    tracking_no_carrier: doc.tracking_no_carrier ?? null,
    actual_label_fee: doc.actual_label_fee ?? null,
    label_obtained_at: doc.label_obtained_at ?? null,
    departed_at: doc.departed_at ?? null,
    pallet_label_id: doc.pallet_label_id ?? null,
    createdAt: doc.createdAt,
  };
}

// ── box ↔ inbound link ──────────────────────────────────────

export const BoxInboundLinkSchema = z
  .object({
    box_id: z.string().min(1),
    outbound_id: z.string().min(1),
    inbound_id: z.string().min(1),
    linked_at: z.date(),
    unlinked_at: z.date().nullable(),
  })
  .strict();
export type BoxInboundLink = z.infer<typeof BoxInboundLinkSchema>;

// ── box weights ─────────────────────────────────────────────

export const OutboundBoxWeightSchema = z
  .object({
    box_id: z.string().min(1),
    outbound_id: z.string().min(1),
    expected_gross_weight: z.number().nonnegative(),
    actual_gross_weight: z.number().nonnegative(),
    tare_weight_input: z.number().nonnegative(),
    weight_diff: z.number(),
    tolerance_threshold: z.number().nonnegative(),
    tolerance_passed: z.boolean(),
    override_at: z.date().nullable(),
    weighed_by_staff_id: z.string().min(1),
    weighed_at: z.date(),
    weigh_method: z.enum(["pda", "desktop"]),
  })
  .strict();
export type OutboundBoxWeight = z.infer<typeof OutboundBoxWeightSchema>;

// ── outbound_scans (append-only WMS audit) ──────────────────

export const OUTBOUND_SCAN_TYPE = [
  "inbound_picked",
  "outbound_pick_complete",
  "box_created",
  "outbound_pack_complete",
  "box_weight_verified",
  "box_weight_override",
  "outbound_weight_verified",
  "label_obtained",
  "label_failed",
  "box_departed",
  "outbound_departed",
] as const;
export type OutboundScanType = (typeof OUTBOUND_SCAN_TYPE)[number];

export const OutboundScanSchema = z
  .object({
    _id: z.string().min(1),
    outbound_id: z.string().min(1),
    inbound_id: z.string().nullable(),
    box_id: z.string().nullable(),
    type: z.enum(OUTBOUND_SCAN_TYPE),
    operator_staff_id: z.string().min(1),
    pick_method: z.enum(["pda_scan", "desktop_batch"]).nullable(),
    weigh_method: z.enum(["pda", "desktop"]).nullable(),
    details: z.record(z.string(), z.unknown()).nullable(),
    staff_note: z.string().max(200).nullable(),
    createdAt: z.date(),
  })
  .strict();
export type OutboundScan = z.infer<typeof OutboundScanSchema>;

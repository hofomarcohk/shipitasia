import { z } from "zod";

// ── locations ─────────────────────────────────────────────

export const LocationSchema = z
  .object({
    warehouseCode: z.string().min(1),
    locationCode: z.string().min(1),
    zone: z.enum(["storage", "pick", "temp", "dispose"]).default("storage"),
    status: z.enum(["active", "disabled"]),
    display_order: z.number().int().default(100),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })
  .strict();
export type Location = z.infer<typeof LocationSchema>;

// ── item_locations (rebuild per Bug 6) ────────────────────

export const ItemLocationSchema = z
  .object({
    itemCode: z.string().min(1), // I-... inbound_id
    itemType: z.enum(["shipment"]).default("shipment"),
    warehouseCode: z.string().min(1),
    locationCode: z.string().min(1),
    currentStatus: z.enum(["in_storage", "picked", "packed", "reverted"]),
    placedBy: z.string().min(1), // staff_id snapshot
    lastMovedAt: z.date(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })
  .strict();
export type ItemLocation = z.infer<typeof ItemLocationSchema>;

// ── inbound_scans (action snapshot, append-only) ──────────

export const SCAN_TYPES = [
  "arrive",
  "receive",
  "unclaimed_arrive",
] as const;
export type ScanType = (typeof SCAN_TYPES)[number];

export const ANOMALY_CODES = [
  "damaged",
  "wet",
  "packaging",
  "mismatch",
] as const;
export type AnomalyCode = (typeof ANOMALY_CODES)[number];

export const AnomalyInputSchema = z
  .object({
    code: z.enum(ANOMALY_CODES),
    note: z.string().min(1).max(500),
    photo_paths: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type AnomalyInput = z.infer<typeof AnomalyInputSchema>;

export const DimensionSchema = z
  .object({
    length: z.coerce.number().int().positive(),
    width: z.coerce.number().int().positive(),
    height: z.coerce.number().int().positive(),
  })
  .strict();

export const PhotoMetaSchema = z
  .object({
    type: z.enum(["barcode", "package", "anomaly"]),
    size: z.number().int().nonnegative(),
    mime: z.string().min(1),
  })
  .strict();

export const InboundScanSchema = z
  .object({
    _id: z.string().min(1), // S{YYYYMMDD}_{NNNN}
    inbound_request_id: z.string().nullable(),
    unclaimed_inbound_id: z.string().nullable(),
    client_id: z.string().nullable(),
    type: z.enum(SCAN_TYPES),
    locationCode: z.string().nullable().optional(),
    weight: z.number().nullable().optional(),
    dimension: DimensionSchema.nullable().optional(),
    photo_paths: z.array(z.string()).default([]),
    photo_metadata: z.array(PhotoMetaSchema).default([]),
    anomalies: AnomalyInputSchema.array().default([]),
    operator_staff_id: z.string().min(1),
    is_combined_arrive: z.boolean().default(false),
    staff_note: z.string().max(200).nullable().optional(),
    cancelled_at: z.date().nullable().optional(),
    cancelled_reason: z.string().nullable().optional(),
    createdAt: z.date(),
  })
  .strict();
export type InboundScan = z.infer<typeof InboundScanSchema>;

export interface InboundScanPublic {
  _id: string;
  inbound_request_id: string | null;
  unclaimed_inbound_id: string | null;
  type: ScanType;
  locationCode: string | null;
  weight: number | null;
  dimension: { length: number; width: number; height: number } | null;
  photo_paths: string[];
  anomalies: AnomalyInput[];
  operator_staff_id: string;
  is_combined_arrive: boolean;
  staff_note: string | null;
  cancelled_at: Date | null;
  cancelled_reason: string | null;
  createdAt: Date;
}

export function projectScan(doc: any): InboundScanPublic {
  return {
    _id: doc._id,
    inbound_request_id: doc.inbound_request_id ?? null,
    unclaimed_inbound_id: doc.unclaimed_inbound_id ?? null,
    type: doc.type,
    locationCode: doc.locationCode ?? null,
    weight: doc.weight ?? null,
    dimension: doc.dimension ?? null,
    photo_paths: doc.photo_paths ?? [],
    anomalies: doc.anomalies ?? [],
    operator_staff_id: doc.operator_staff_id,
    is_combined_arrive: !!doc.is_combined_arrive,
    staff_note: doc.staff_note ?? null,
    cancelled_at: doc.cancelled_at ?? null,
    cancelled_reason: doc.cancelled_reason ?? null,
    createdAt: doc.createdAt,
  };
}

// ── unclaimed_inbounds ────────────────────────────────────

export const UnclaimedInboundSchema = z
  .object({
    _id: z.string().min(1), // U-YYYYMMDD-NNNN
    warehouseCode: z.string().min(1),
    carrier_inbound_code: z.string().min(1),
    tracking_no: z.string().min(1),
    tracking_no_normalized: z.string().min(1),
    weight: z.number(),
    dimension: DimensionSchema,
    photo_paths: z.array(z.string()).default([]),
    staff_note: z.string().min(1).max(500),
    status: z.enum(["pending_assignment", "assigned", "disposed"]),
    assigned_to_client_id: z.string().nullable().optional(),
    assigned_to_inbound_id: z.string().nullable().optional(),
    assigned_at: z.date().nullable().optional(),
    assigned_by_staff_id: z.string().nullable().optional(),
    disposed_at: z.date().nullable().optional(),
    disposed_reason: z.string().nullable().optional(),
    arrived_at: z.date(),
    arrived_by_staff_id: z.string().min(1),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
export type UnclaimedInbound = z.infer<typeof UnclaimedInboundSchema>;

export interface UnclaimedPublic {
  _id: string;
  warehouseCode: string;
  carrier_inbound_code: string;
  tracking_no: string;
  weight: number;
  dimension: { length: number; width: number; height: number };
  photo_paths: string[];
  staff_note: string;
  status: "pending_assignment" | "assigned" | "disposed";
  arrived_at: Date;
  arrived_by_staff_id: string;
}

export function projectUnclaimed(doc: any): UnclaimedPublic {
  return {
    _id: doc._id,
    warehouseCode: doc.warehouseCode,
    carrier_inbound_code: doc.carrier_inbound_code,
    tracking_no: doc.tracking_no,
    weight: doc.weight,
    dimension: doc.dimension,
    photo_paths: doc.photo_paths ?? [],
    staff_note: doc.staff_note,
    status: doc.status,
    arrived_at: doc.arrived_at,
    arrived_by_staff_id: doc.arrived_by_staff_id,
  };
}

// ── scan input schemas (route layer parses these) ─────────

export const ArriveInputSchema = z
  .object({
    tracking_no: z.string().min(1),
    inbound_id: z.string().optional(), // optional fast-path
    weight: z.coerce.number().optional(),
    dimension: DimensionSchema.optional(),
    photo_barcode_paths: z.array(z.string().min(1)).min(1),
    photo_package_paths: z.array(z.string().min(1)).min(1),
    anomalies: AnomalyInputSchema.array().default([]),
    staff_note: z.string().max(200).optional(),
  })
  .strict();

export const ReceiveInputSchema = z
  .object({
    inbound_id: z.string().min(1),
    locationCode: z.string().min(1),
    weight: z.coerce.number().optional(),
    dimension: DimensionSchema.optional(),
    photo_barcode_paths: z.array(z.string().min(1)).default([]),
    photo_package_paths: z.array(z.string().min(1)).default([]),
    anomalies: AnomalyInputSchema.array().default([]),
    staff_note: z.string().max(200).optional(),
  })
  .strict();

export const UnclaimedRegisterSchema = z
  .object({
    tracking_no: z.string().min(1),
    carrier_inbound_code: z.string().min(1),
    weight: z.coerce.number().positive(),
    dimension: DimensionSchema,
    photo_paths: z.array(z.string().min(1)).min(1),
    staff_note: z.string().min(1).max(500),
  })
  .strict();

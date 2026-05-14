// P10 — WMS pick batch (wave) + pallet label types.
//
// A pick_batch is an ad-hoc wave of outbound_requests grouped by warehouse
// staff to be picked together (1/day or every-few-days). The batch is the
// unit of work for PDA location-centric picking — staff scan a shelf
// barcode and see every inbound on that shelf across all outbounds in the
// active batch.
//
// A pallet_label is the post-weighing physical staging marker. After
// complete weighing of an outbound, the system mints one pallet barcode;
// staff prints it, sticks it on the pallet, and the boxes sit until the
// client confirms label. On client confirm, staff scans the pallet
// barcode at the label-print page to retrieve and proceed.

import { z } from "zod";

// ── pick_batches ─────────────────────────────────────────────

export const PICK_BATCH_STATUS = [
  "draft", // created, outbound list still mutable
  "picking", // started, PDA active, outbound list locked
  "picked", // all outbounds in batch reached status=picked
  "closed", // batch wrapped up by staff
  "cancelled",
] as const;
export type PickBatchStatus = (typeof PICK_BATCH_STATUS)[number];

export const PickBatchSchema = z
  .object({
    _id: z.string().min(1), // e.g. PB-YYYYMMDD-NNNN
    batch_no: z.string().min(1), // display label, same as _id v1
    warehouseCode: z.string().min(1),
    status: z.enum(PICK_BATCH_STATUS),
    outbound_ids: z.array(z.string().min(1)).default([]),
    note: z.string().max(200).nullable(),
    created_by_staff_id: z.string().min(1),
    started_at: z.date().nullable(),
    started_by_staff_id: z.string().nullable(),
    picked_at: z.date().nullable(),
    closed_at: z.date().nullable(),
    closed_by_staff_id: z.string().nullable(),
    cancelled_at: z.date().nullable(),
    cancel_reason: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
export type PickBatch = z.infer<typeof PickBatchSchema>;

export interface PickBatchPublic {
  _id: string;
  batch_no: string;
  warehouseCode: string;
  status: PickBatchStatus;
  outbound_ids: string[];
  note: string | null;
  created_by_staff_id: string;
  started_at: Date | null;
  started_by_staff_id: string | null;
  picked_at: Date | null;
  closed_at: Date | null;
  closed_by_staff_id: string | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function projectPickBatch(doc: any): PickBatchPublic {
  return {
    _id: String(doc._id),
    batch_no: doc.batch_no ?? String(doc._id),
    warehouseCode: doc.warehouseCode,
    status: doc.status,
    outbound_ids: doc.outbound_ids ?? [],
    note: doc.note ?? null,
    created_by_staff_id: doc.created_by_staff_id,
    started_at: doc.started_at ?? null,
    started_by_staff_id: doc.started_by_staff_id ?? null,
    picked_at: doc.picked_at ?? null,
    closed_at: doc.closed_at ?? null,
    closed_by_staff_id: doc.closed_by_staff_id ?? null,
    cancelled_at: doc.cancelled_at ?? null,
    cancel_reason: doc.cancel_reason ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── pallet_labels ────────────────────────────────────────────

export const PalletLabelSchema = z
  .object({
    _id: z.string().min(1), // pallet_no, e.g. PL-YYYYMMDD-NNNN
    pallet_no: z.string().min(1),
    batch_id: z.string().nullable(), // null if outbound wasn't in a batch
    outbound_id: z.string().min(1),
    client_id: z.string().min(1),
    box_count: z.number().int().positive(),
    total_weight_kg: z.number().nonnegative(),
    carrier_code: z.string().min(1),
    destination_country: z.string().length(2),
    printed_at: z.date(),
    printed_by_staff_id: z.string().min(1),
    reprint_count: z.number().int().nonnegative().default(0),
    last_reprint_at: z.date().nullable(),
    scanned_back_at: z.date().nullable(),
    scanned_back_by_staff_id: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
export type PalletLabel = z.infer<typeof PalletLabelSchema>;

export interface PalletLabelPublic {
  _id: string;
  pallet_no: string;
  batch_id: string | null;
  outbound_id: string;
  client_id: string;
  box_count: number;
  total_weight_kg: number;
  carrier_code: string;
  destination_country: string;
  printed_at: Date;
  printed_by_staff_id: string;
  reprint_count: number;
  last_reprint_at: Date | null;
  scanned_back_at: Date | null;
  scanned_back_by_staff_id: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function projectPalletLabel(doc: any): PalletLabelPublic {
  return {
    _id: String(doc._id),
    pallet_no: doc.pallet_no,
    batch_id: doc.batch_id ?? null,
    outbound_id: doc.outbound_id,
    client_id: doc.client_id,
    box_count: doc.box_count,
    total_weight_kg: doc.total_weight_kg,
    carrier_code: doc.carrier_code,
    destination_country: doc.destination_country,
    printed_at: doc.printed_at,
    printed_by_staff_id: doc.printed_by_staff_id,
    reprint_count: doc.reprint_count ?? 0,
    last_reprint_at: doc.last_reprint_at ?? null,
    scanned_back_at: doc.scanned_back_at ?? null,
    scanned_back_by_staff_id: doc.scanned_back_by_staff_id ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── PDA shelf-pick view payload ──────────────────────────────

export interface ShelfPickItem {
  inbound_id: string;
  tracking_no: string;
  client_id: string;
  client_short: string; // e.g. last 4 of client_id
  client_code: string | null; // SIA code for display
  outbound_id: string;
  outbound_short: string;
  declared_name: string | null;
  thumbnail_path: string | null;
  status: "pending" | "picked";
  actualWeight: number | null;
}

export interface ShelfPickResponse {
  locationCode: string;
  batch_id: string;
  total_items: number;
  pending_items: number;
  client_count: number;
  items: ShelfPickItem[];
}

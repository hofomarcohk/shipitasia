import { z } from "zod";

export const PACK_BOX_STATUS = ["open", "sealed", "cancelled"] as const;
export type PackBoxStatus = (typeof PACK_BOX_STATUS)[number];

export const PackBoxItemSchema = z
  .object({
    inbound_id: z.string().min(1),
    outbound_id: z.string().min(1),
    tracking_no: z.string().min(1),
    placed_at: z.date(),
    placed_by: z.string(),
  })
  .strict();
export type PackBoxItem = z.infer<typeof PackBoxItemSchema>;

export const PackBoxV1Schema = z
  .object({
    _id: z.string().min(1),
    box_no: z.string().min(1),
    client_id: z.string().min(1),
    client_code: z.string().min(1),
    warehouse_code: z.string().min(1),

    status: z.enum(PACK_BOX_STATUS),
    is_single_direct: z.boolean().default(false),

    items: PackBoxItemSchema.array().default([]),
    max_slots: z.number().int().positive().default(8),

    width: z.number().nonnegative().default(0),
    length: z.number().nonnegative().default(0),
    height: z.number().nonnegative().default(0),
    weight: z.number().nonnegative().default(0),

    opened_at: z.date(),
    opened_by: z.string(),
    sealed_at: z.date().nullable().default(null),
    sealed_by: z.string().nullable().default(null),
    cancelled_at: z.date().nullable().default(null),
    cancelled_by: z.string().nullable().default(null),

    // P12 — 秤重置板 (weigh + palletize) timestamps; additive optional fields.
    weighed_at: z.date().nullable().default(null),
    weighed_by: z.string().nullable().default(null),
    palletize_scanned_at: z.date().nullable().default(null),
    palletize_scanned_by: z.string().nullable().default(null),

    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
export type PackBoxV1 = z.infer<typeof PackBoxV1Schema>;

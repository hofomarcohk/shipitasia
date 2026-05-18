// P13 — label batches. A doc per 合併取單 request grouping multiple outbounds
// in one carrier API call. Per-outbound state (status, label_url, tracking,
// boxes) stays on outbound_requests / outbound_boxes; this collection just
// records the grouping + carrier-side outcome.

import { z } from "zod";

export const LABEL_BATCH_STATUS = [
  "obtaining",
  "obtained",
  "failed",
] as const;
export type LabelBatchStatus = (typeof LABEL_BATCH_STATUS)[number];

export const LabelBatchSchema = z
  .object({
    _id: z.string().min(1), // BATCH-YYYYMMDD-NNNN
    client_id: z.string().min(1),
    warehouseCode: z.string().min(1),
    carrier_code: z.string().min(1),
    destination_country: z.string().length(2),
    outbound_ids: z.string().min(1).array().min(1),
    box_count: z.number().int().nonnegative(),

    status: z.enum(LABEL_BATCH_STATUS),
    requested_at: z.date(),
    obtained_at: z.date().nullable(),
    failed_at: z.date().nullable(),
    error_message: z.string().nullable(),

    total_actual_label_fee: z.number().nonnegative().default(0),

    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
export type LabelBatch = z.infer<typeof LabelBatchSchema>;

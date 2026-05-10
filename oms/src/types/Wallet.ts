import { z } from "zod";

export const WALLET_TRANSACTION_TYPES = [
  "topup",
  "topup_rejected",
  "charge_inbound",
  "refund_unclaimed",
  "refund_label_failed",
  "adjustment",
] as const;

export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

// Append-only — no updatedAt, ever.
export const WalletTransactionSchema = z
  .object({
    client_id: z.string().min(1),
    type: z.enum(WALLET_TRANSACTION_TYPES),
    amount: z.number().int(), // HKD integer (v1 §0.1)
    currency: z.string().default("HKD"),
    balance_before: z.number().int(),
    balance_after: z.number().int(),
    reference_type: z
      .enum(["topup_request", "inbound", "unclaimed", "outbound", "manual"])
      .nullable()
      .optional(),
    reference_id: z.string().nullable().optional(),
    gateway: z.string().default("manual"),
    gateway_ref: z.string().nullable().optional(),
    operator_staff_id: z.string().nullable().optional(),
    customer_note: z.string().nullable().optional(),
    internal_note: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    createdAt: z.date(),
  })
  .strict();

export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

// Public projection — strips operator_staff_id / internal_note / metadata
// so clients never see admin-internal data.
export interface WalletTransactionPublic {
  _id: string;
  type: WalletTransactionType;
  amount: number;
  currency: string;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  customer_note: string | null;
  createdAt: Date;
}

export function projectTransaction(doc: any): WalletTransactionPublic {
  return {
    _id: doc._id?.toString(),
    type: doc.type,
    amount: doc.amount,
    currency: doc.currency ?? "HKD",
    balance_after: doc.balance_after,
    reference_type: doc.reference_type ?? null,
    reference_id: doc.reference_id ?? null,
    customer_note: doc.customer_note ?? null,
    createdAt: doc.createdAt,
  };
}

// Admin sees the same shape plus the operator + internal_note fields.
export interface WalletTransactionAdmin extends WalletTransactionPublic {
  balance_before: number;
  gateway: string;
  gateway_ref: string | null;
  operator_staff_id: string | null;
  internal_note: string | null;
  metadata: Record<string, unknown> | null;
  client_id: string;
}

export function projectTransactionAdmin(doc: any): WalletTransactionAdmin {
  return {
    ...projectTransaction(doc),
    balance_before: doc.balance_before,
    gateway: doc.gateway ?? "manual",
    gateway_ref: doc.gateway_ref ?? null,
    operator_staff_id: doc.operator_staff_id ?? null,
    internal_note: doc.internal_note ?? null,
    metadata: doc.metadata ?? null,
    client_id: doc.client_id,
  };
}

// ── topup_requests ───────────────────────────────────────────

export const TopupRequestStatusEnum = z.enum([
  "pending",
  "approved",
  "rejected",
]);
export type TopupRequestStatus = z.infer<typeof TopupRequestStatusEnum>;

export const TopupRequestSchema = z
  .object({
    client_id: z.string().min(1),
    amount: z.number().int().positive(),
    currency: z.string().default("HKD"),
    transfer_date: z.date(),
    transfer_account_last4: z.string().regex(/^\d{4}$/).nullable().optional(),
    proof_file_path: z.string().min(1),
    proof_file_size: z.number().int().positive(),
    proof_file_mime: z.string().min(1),
    customer_note: z.string().max(200).nullable().optional(),
    status: TopupRequestStatusEnum,
    submitted_at: z.date(),
    approved_at: z.date().nullable().optional(),
    approved_by_staff_id: z.string().nullable().optional(),
    rejected_at: z.date().nullable().optional(),
    rejected_by_staff_id: z.string().nullable().optional(),
    reject_reason: z.string().nullable().optional(),
    wallet_transaction_id: z.string().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type TopupRequest = z.infer<typeof TopupRequestSchema>;

export interface TopupRequestPublic {
  _id: string;
  amount: number;
  currency: string;
  status: TopupRequestStatus;
  submitted_at: Date;
  approved_at: Date | null;
  rejected_at: Date | null;
  reject_reason: string | null;
  customer_note: string | null;
  transfer_date: Date;
  transfer_account_last4: string | null;
  has_proof: boolean;
}

export function projectTopupRequest(doc: any): TopupRequestPublic {
  return {
    _id: doc._id?.toString(),
    amount: doc.amount,
    currency: doc.currency ?? "HKD",
    status: doc.status,
    submitted_at: doc.submitted_at,
    approved_at: doc.approved_at ?? null,
    rejected_at: doc.rejected_at ?? null,
    reject_reason: doc.reject_reason ?? null,
    customer_note: doc.customer_note ?? null,
    transfer_date: doc.transfer_date,
    transfer_account_last4: doc.transfer_account_last4 ?? null,
    has_proof: !!doc.proof_file_path,
  };
}

export interface TopupRequestAdmin extends TopupRequestPublic {
  client_id: string;
  proof_file_path: string;
  proof_file_size: number;
  proof_file_mime: string;
  approved_by_staff_id: string | null;
  rejected_by_staff_id: string | null;
  wallet_transaction_id: string | null;
}

export function projectTopupRequestAdmin(doc: any): TopupRequestAdmin {
  return {
    ...projectTopupRequest(doc),
    client_id: doc.client_id,
    proof_file_path: doc.proof_file_path,
    proof_file_size: doc.proof_file_size,
    proof_file_mime: doc.proof_file_mime,
    approved_by_staff_id: doc.approved_by_staff_id ?? null,
    rejected_by_staff_id: doc.rejected_by_staff_id ?? null,
    wallet_transaction_id: doc.wallet_transaction_id ?? null,
  };
}

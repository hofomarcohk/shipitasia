import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase, getMongoClient } from "@/lib/mongo";
import { logAudit } from "@/services/audit/log";
import {
  WalletTransactionPublic,
  projectTransaction,
  projectTransactionAdmin,
} from "@/types/Wallet";
import { ObjectId } from "mongodb";

// ── Inputs ──────────────────────────────────────────────────────

export interface ChargeInput {
  client_id: string;
  amount: number; // positive integer; service converts to negative
  reference_type: "inbound" | "unclaimed" | "outbound";
  reference_id: string;
  customer_note?: string;
  internal_note?: string;
  metadata?: Record<string, unknown>;
}

export interface TopupInput {
  client_id: string;
  amount: number; // positive integer
  reference_type: "topup_request" | "manual";
  reference_id?: string;
  gateway: string;
  gateway_ref?: string;
  operator_staff_id?: string;
  customer_note?: string;
  internal_note?: string;
}

export interface RefundInput {
  client_id: string;
  amount: number; // positive integer
  type: "refund_unclaimed" | "refund_label_failed";
  reference_type: "unclaimed" | "outbound";
  reference_id: string;
  operator_staff_id?: string;
  customer_note?: string;
  internal_note?: string;
}

export interface AdjustmentInput {
  client_id: string;
  amount: number; // positive or negative (non-zero)
  operator_staff_id: string;
  customer_note: string;
  internal_note?: string;
}

export interface TransactionResult {
  transaction_id: string;
  balance_before: number;
  balance_after: number;
}

// ── Internal core: atomic write inside a mongo transaction ──────

interface WriteParams {
  client_id: string;
  delta: number; // signed
  type:
    | "topup"
    | "topup_rejected"
    | "charge_inbound"
    | "refund_unclaimed"
    | "refund_label_failed"
    | "adjustment";
  reference_type?: string | null;
  reference_id?: string | null;
  gateway?: string;
  gateway_ref?: string | null;
  operator_staff_id?: string | null;
  customer_note?: string | null;
  internal_note?: string | null;
  metadata?: Record<string, unknown> | null;
}

async function writeAtomic(p: WriteParams): Promise<TransactionResult> {
  const db = await connectToDatabase();
  // The MongoClient is owned by the singleton in lib/mongo.ts. Use a session
  // to wrap both the wallet_transactions insert and the clients.balance
  // $inc in one atomic flip.
  const session = getMongoClient().startSession();
  try {
    let txId = "";
    let balance_before = 0;
    let balance_after = 0;
    await session.withTransaction(async () => {
      const objId = new ObjectId(p.client_id);
      const c = await db
        .collection(collections.CLIENT)
        .findOne({ _id: objId }, { session });
      if (!c) {
        throw new ApiError("INVALID_CREDENTIALS"); // semantically: unknown client
      }
      balance_before = c.balance ?? 0;
      balance_after = balance_before + p.delta;

      // For topup_rejected (delta=0) we still write a row so the client
      // sees the trail, but we skip the $inc to avoid touching updatedAt.
      const now = new Date();
      const ins = await db.collection(collections.WALLET_TRANSACTION).insertOne(
        {
          client_id: p.client_id,
          type: p.type,
          amount: p.delta,
          currency: "HKD",
          balance_before,
          balance_after,
          reference_type: p.reference_type ?? null,
          reference_id: p.reference_id ?? null,
          gateway: p.gateway ?? "manual",
          gateway_ref: p.gateway_ref ?? null,
          operator_staff_id: p.operator_staff_id ?? null,
          customer_note: p.customer_note ?? null,
          internal_note: p.internal_note ?? null,
          metadata: p.metadata ?? null,
          createdAt: now,
        } as any,
        { session }
      );
      txId = ins.insertedId.toString();

      if (p.delta !== 0) {
        await db
          .collection(collections.CLIENT)
          .updateOne(
            { _id: objId },
            { $inc: { balance: p.delta }, $set: { updatedAt: now } },
            { session }
          );
      }
    });
    return { transaction_id: txId, balance_before, balance_after };
  } finally {
    await session.endSession();
  }
}

// ── Public API ──────────────────────────────────────────────────

export async function charge(input: ChargeInput): Promise<TransactionResult> {
  validatePositiveInt(input.amount, "amount");
  const result = await writeAtomic({
    client_id: input.client_id,
    delta: -input.amount,
    type: "charge_inbound",
    reference_type: input.reference_type,
    reference_id: input.reference_id,
    operator_staff_id: null,
    customer_note: input.customer_note,
    internal_note: input.internal_note,
    metadata: input.metadata ?? null,
  });
  await logAudit({
    action: AUDIT_ACTIONS.wallet_charged,
    actor_type: AUDIT_ACTOR_TYPES.system,
    actor_id: null,
    target_type: AUDIT_TARGET_TYPES.wallet,
    target_id: input.client_id,
    details: {
      amount: input.amount,
      reference_type: input.reference_type,
      reference_id: input.reference_id,
      balance_after: result.balance_after,
    },
  });
  return result;
}

export async function topup(input: TopupInput): Promise<TransactionResult> {
  validatePositiveInt(input.amount, "amount");
  const result = await writeAtomic({
    client_id: input.client_id,
    delta: input.amount,
    type: "topup",
    reference_type: input.reference_type,
    reference_id: input.reference_id,
    gateway: input.gateway,
    gateway_ref: input.gateway_ref,
    operator_staff_id: input.operator_staff_id,
    customer_note: input.customer_note,
    internal_note: input.internal_note,
  });
  await logAudit({
    action: AUDIT_ACTIONS.wallet_topup_approved,
    actor_type: input.operator_staff_id
      ? AUDIT_ACTOR_TYPES.admin
      : AUDIT_ACTOR_TYPES.system,
    actor_id: input.operator_staff_id ?? null,
    target_type: AUDIT_TARGET_TYPES.wallet,
    target_id: input.client_id,
    details: {
      amount: input.amount,
      gateway: input.gateway,
      reference_type: input.reference_type,
      reference_id: input.reference_id,
      balance_after: result.balance_after,
    },
  });
  return result;
}

export async function refund(input: RefundInput): Promise<TransactionResult> {
  validatePositiveInt(input.amount, "amount");
  const result = await writeAtomic({
    client_id: input.client_id,
    delta: input.amount,
    type: input.type,
    reference_type: input.reference_type,
    reference_id: input.reference_id,
    operator_staff_id: input.operator_staff_id,
    customer_note: input.customer_note,
    internal_note: input.internal_note,
  });
  await logAudit({
    action: AUDIT_ACTIONS.wallet_refunded,
    actor_type: input.operator_staff_id
      ? AUDIT_ACTOR_TYPES.admin
      : AUDIT_ACTOR_TYPES.system,
    actor_id: input.operator_staff_id ?? null,
    target_type: AUDIT_TARGET_TYPES.wallet,
    target_id: input.client_id,
    details: {
      amount: input.amount,
      type: input.type,
      reference_type: input.reference_type,
      reference_id: input.reference_id,
      balance_after: result.balance_after,
    },
  });
  return result;
}

export async function adjustment(
  input: AdjustmentInput
): Promise<TransactionResult> {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new ApiError("INVALID_ADJUSTMENT_AMOUNT");
  }
  if (!input.operator_staff_id) {
    throw new ApiError("INVALID_ADJUSTMENT_AMOUNT", {
      details: "operator_staff_id required",
    });
  }
  if (!input.customer_note || !input.customer_note.trim()) {
    throw new ApiError("INVALID_ADJUSTMENT_AMOUNT", {
      details: "customer_note required",
    });
  }
  const result = await writeAtomic({
    client_id: input.client_id,
    delta: input.amount,
    type: "adjustment",
    reference_type: "manual",
    reference_id: null,
    operator_staff_id: input.operator_staff_id,
    customer_note: input.customer_note,
    internal_note: input.internal_note,
  });
  await logAudit({
    action: AUDIT_ACTIONS.wallet_adjusted,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: input.operator_staff_id,
    target_type: AUDIT_TARGET_TYPES.wallet,
    target_id: input.client_id,
    details: {
      amount: input.amount,
      customer_note: input.customer_note,
      balance_after: result.balance_after,
    },
  });
  return result;
}

/**
 * Records a topup_rejected row (delta=0). No balance change; pure audit
 * trail so the client sees their request resolved.
 */
export async function recordTopupRejected(input: {
  client_id: string;
  amount: number;
  reference_id: string;
  operator_staff_id: string;
  reject_reason: string;
}): Promise<{ transaction_id: string }> {
  const result = await writeAtomic({
    client_id: input.client_id,
    delta: 0,
    type: "topup_rejected",
    reference_type: "topup_request",
    reference_id: input.reference_id,
    operator_staff_id: input.operator_staff_id,
    customer_note: input.reject_reason,
  });
  await logAudit({
    action: AUDIT_ACTIONS.wallet_topup_rejected,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: input.operator_staff_id,
    target_type: AUDIT_TARGET_TYPES.topup_request,
    target_id: input.reference_id,
    details: {
      amount: input.amount,
      reject_reason: input.reject_reason,
    },
  });
  return { transaction_id: result.transaction_id };
}

// ── Read API ────────────────────────────────────────────────────

export async function getBalance(client_id: string): Promise<number> {
  const db = await connectToDatabase();
  const c = await db
    .collection(collections.CLIENT)
    .findOne(
      { _id: new ObjectId(client_id) },
      { projection: { balance: 1 } }
    );
  return c?.balance ?? 0;
}

export interface GetTransactionsOptions {
  from?: Date;
  to?: Date;
  type?: string;
  limit?: number;
  offset?: number;
}

export async function getTransactions(
  client_id: string,
  options: GetTransactionsOptions = {}
): Promise<{ items: WalletTransactionPublic[]; total: number }> {
  const db = await connectToDatabase();
  const filter: Record<string, unknown> = { client_id };
  if (options.type) filter.type = options.type;
  if (options.from || options.to) {
    const range: any = {};
    if (options.from) range.$gte = options.from;
    if (options.to) range.$lte = options.to;
    filter.createdAt = range;
  }
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;
  const total = await db
    .collection(collections.WALLET_TRANSACTION)
    .countDocuments(filter);
  const docs = await db
    .collection(collections.WALLET_TRANSACTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  return { items: docs.map(projectTransaction), total };
}

export async function getTransactionsAdmin(
  client_id: string,
  options: GetTransactionsOptions = {}
) {
  const db = await connectToDatabase();
  const filter: Record<string, unknown> = { client_id };
  if (options.type) filter.type = options.type;
  if (options.from || options.to) {
    const range: any = {};
    if (options.from) range.$gte = options.from;
    if (options.to) range.$lte = options.to;
    filter.createdAt = range;
  }
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;
  const total = await db
    .collection(collections.WALLET_TRANSACTION)
    .countDocuments(filter);
  const docs = await db
    .collection(collections.WALLET_TRANSACTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  return { items: docs.map(projectTransactionAdmin), total };
}

// ── Helpers ─────────────────────────────────────────────────────

function validatePositiveInt(n: number, name: string): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError("INVALID_ADJUSTMENT_AMOUNT", {
      details: `${name} must be a positive integer (got ${n})`,
    });
  }
}

// Public alias matching spec naming (review.md §7.1 + Phase 5/6/8 call this)
export const walletService = {
  charge,
  topup,
  refund,
  adjustment,
  recordTopupRejected,
  getBalance,
  getTransactions,
  getTransactionsAdmin,
};

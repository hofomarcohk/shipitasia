import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { logAudit } from "@/services/audit/log";
import {
  TopupRequestAdmin,
  TopupRequestPublic,
  projectTopupRequest,
  projectTopupRequestAdmin,
} from "@/types/Wallet";
import { walletService } from "@/services/wallet/walletService";
import fs from "node:fs/promises";
import path from "node:path";
import { ObjectId } from "mongodb";
import { z } from "zod";

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
]);
const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "pdf"]);

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

function uploadsBase(): string {
  // Honour UPLOADS_BASE_PATH env so dev / staging / prod can point elsewhere.
  // Default to ./uploads relative to the running process.
  return process.env.UPLOADS_BASE_PATH || "./uploads";
}

// ── Client: submit a topup request ──────────────────────────────

export const SubmitTopupInputSchema = z
  .object({
    amount: z.coerce.number().int().positive(),
    transfer_date: z.coerce.date(),
    transfer_account_last4: z
      .string()
      .regex(/^\d{4}$/, "must be 4 digits")
      .optional(),
    customer_note: z.string().max(200).optional(),
  })
  .strict();

export interface SubmitTopupInput
  extends z.infer<typeof SubmitTopupInputSchema> {}

export interface ProofFileInput {
  buffer: Buffer;
  size: number;
  mime: string;
  original_name: string;
}

export async function submitTopupRequest(
  raw: unknown,
  file: ProofFileInput | null,
  ctx: ClientContext
): Promise<{ topup_id: string }> {
  const input = SubmitTopupInputSchema.parse(raw);

  const minTopup = parseInt(process.env.WALLET_MIN_TOPUP || "100", 10);
  if (input.amount < minTopup) {
    throw new ApiError("AMOUNT_TOO_LOW", {
      details: `minimum ${minTopup}`,
    });
  }

  if (!file) throw new ApiError("PROOF_FILE_REQUIRED");
  const maxBytes =
    parseInt(process.env.TOPUP_PROOF_MAX_SIZE_MB || "5", 10) * 1024 * 1024;
  if (file.size > maxBytes) throw new ApiError("FILE_TOO_LARGE");
  if (!ALLOWED_MIMES.has(file.mime.toLowerCase())) {
    throw new ApiError("FILE_TYPE_NOT_ALLOWED");
  }
  const ext = (file.original_name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw new ApiError("FILE_TYPE_NOT_ALLOWED");
  }

  const db = await connectToDatabase();
  const now = new Date();

  // We need to know the topup_id before we name the file, but we also can't
  // write the file unless the DB row exists (so cleanup on rollback is
  // well-defined). Strategy: insert with a placeholder path, then write the
  // file using the inserted _id, then update the row with the final path.
  const ins = await db.collection(collections.TOPUP_REQUEST).insertOne({
    client_id: ctx.client_id,
    amount: input.amount,
    currency: "HKD",
    transfer_date: input.transfer_date,
    transfer_account_last4: input.transfer_account_last4 ?? null,
    proof_file_path: "__pending__",
    proof_file_size: file.size,
    proof_file_mime: file.mime,
    customer_note: input.customer_note ?? null,
    status: "pending",
    submitted_at: now,
    approved_at: null,
    approved_by_staff_id: null,
    rejected_at: null,
    rejected_by_staff_id: null,
    reject_reason: null,
    wallet_transaction_id: null,
    createdAt: now,
    updatedAt: now,
  } as any);
  const topup_id = ins.insertedId.toString();

  // Persist the file: /uploads/topup-proofs/{client_id}/{topup_id}_{ts}.{ext}
  const relative = path.join(
    "topup-proofs",
    ctx.client_id,
    `${topup_id}_${now.getTime()}.${ext}`
  );
  const absolute = path.join(uploadsBase(), relative);
  try {
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, file.buffer);
  } catch (err) {
    // File system failure → roll back the DB row so we don't leave orphan
    // rows that point at non-existent paths.
    await db
      .collection(collections.TOPUP_REQUEST)
      .deleteOne({ _id: ins.insertedId });
    throw new ApiError("WALLET_TRANSACTION_FAILED", {
      details: (err as Error).message,
    });
  }

  await db
    .collection(collections.TOPUP_REQUEST)
    .updateOne(
      { _id: ins.insertedId },
      { $set: { proof_file_path: relative, updatedAt: new Date() } }
    );

  await logAudit({
    action: AUDIT_ACTIONS.wallet_topup_requested,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.topup_request,
    target_id: topup_id,
    details: {
      amount: input.amount,
      transfer_date: input.transfer_date.toISOString(),
      proof_size: file.size,
      proof_mime: file.mime,
    },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return { topup_id };
}

// ── Client: list / get own requests ─────────────────────────────

export async function listMyTopupRequests(
  ctx: ClientContext
): Promise<TopupRequestPublic[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.TOPUP_REQUEST)
    .find({ client_id: ctx.client_id })
    .sort({ submitted_at: -1 })
    .toArray();
  return docs.map(projectTopupRequest);
}

export async function getMyTopupRequest(
  id: string,
  ctx: ClientContext
): Promise<TopupRequestPublic> {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("TOPUP_REQUEST_NOT_FOUND");
  }
  const doc = await db
    .collection(collections.TOPUP_REQUEST)
    .findOne({ _id: objId, client_id: ctx.client_id });
  if (!doc) throw new ApiError("TOPUP_REQUEST_NOT_FOUND");
  return projectTopupRequest(doc);
}

// ── Admin: list / approve / reject ──────────────────────────────

export interface AdminListOptions {
  status?: "pending" | "approved" | "rejected";
  client_id?: string;
  page?: number;
  page_size?: number;
}

export async function adminListTopupRequests(options: AdminListOptions = {}): Promise<{
  items: TopupRequestAdmin[];
  total: number;
  page: number;
  page_size: number;
}> {
  const db = await connectToDatabase();
  const filter: Record<string, unknown> = {};
  if (options.status) filter.status = options.status;
  if (options.client_id) filter.client_id = options.client_id;
  const page = options.page ?? 1;
  const page_size = Math.min(options.page_size ?? 50, 200);
  const total = await db
    .collection(collections.TOPUP_REQUEST)
    .countDocuments(filter);
  const docs = await db
    .collection(collections.TOPUP_REQUEST)
    .find(filter)
    // Pending FIFO; non-pending most-recent-first
    .sort(
      options.status === "pending"
        ? { submitted_at: 1 }
        : { submitted_at: -1 }
    )
    .skip((page - 1) * page_size)
    .limit(page_size)
    .toArray();
  return {
    items: docs.map(projectTopupRequestAdmin),
    total,
    page,
    page_size,
  };
}

export async function adminGetTopupRequest(
  id: string
): Promise<TopupRequestAdmin> {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("TOPUP_REQUEST_NOT_FOUND");
  }
  const doc = await db.collection(collections.TOPUP_REQUEST).findOne({ _id: objId });
  if (!doc) throw new ApiError("TOPUP_REQUEST_NOT_FOUND");
  return projectTopupRequestAdmin(doc);
}

export async function adminApproveTopup(id: string, actor: AdminContext) {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("TOPUP_REQUEST_NOT_FOUND");
  }
  // Atomic claim — only the first concurrent admin click flips pending→approved
  const claim = await db
    .collection(collections.TOPUP_REQUEST)
    .findOneAndUpdate(
      { _id: objId, status: "pending" },
      {
        $set: {
          status: "approved",
          approved_at: new Date(),
          approved_by_staff_id: actor.staff_id,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );
  // Driver v6 returns the doc directly (or null); v5 wrapped it in {value}
  const updated = claim
    ? ((claim as any).value !== undefined ? (claim as any).value : claim)
    : null;
  if (!updated || updated.status !== "approved") {
    // Differentiate "not found" vs "already processed" for a clearer UI
    const existing = await db
      .collection(collections.TOPUP_REQUEST)
      .findOne({ _id: objId });
    if (!existing) throw new ApiError("TOPUP_REQUEST_NOT_FOUND");
    throw new ApiError("TOPUP_ALREADY_PROCESSED");
  }

  // Credit the wallet. If this fails, we deliberately leave the topup_request
  // in `approved` state and surface the error — admin can reconcile via
  // rebuild-balance script. Documented in spec §8.4.
  const txResult = await walletService.topup({
    client_id: updated.client_id,
    amount: updated.amount,
    reference_type: "topup_request",
    reference_id: id,
    gateway: "manual",
    operator_staff_id: actor.staff_id,
    customer_note: `Topup #${id.substring(0, 8)} approved`,
  });

  await db
    .collection(collections.TOPUP_REQUEST)
    .updateOne(
      { _id: objId },
      {
        $set: {
          wallet_transaction_id: txResult.transaction_id,
          updatedAt: new Date(),
        },
      }
    );

  // P7 hook: top-up may free up held(insufficient_balance) outbounds. We
  // import lazily to avoid a circular dependency between wallet and
  // outbound services. Failures are swallowed so a flaky outbound release
  // never blocks the topup approval.
  try {
    const { releaseHeldByBalance } = await import(
      "@/services/outbound/outbound-service"
    );
    await releaseHeldByBalance(updated.client_id);
  } catch {
    // best-effort; admin can manually release via admin UI if needed
  }

  return await adminGetTopupRequest(id);
}

export const RejectTopupInputSchema = z
  .object({
    reject_reason: z.string().min(1).max(500),
  })
  .strict();

export async function adminRejectTopup(
  id: string,
  raw: unknown,
  actor: AdminContext
) {
  const { reject_reason } = RejectTopupInputSchema.parse(raw);

  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("TOPUP_REQUEST_NOT_FOUND");
  }
  const claim = await db
    .collection(collections.TOPUP_REQUEST)
    .findOneAndUpdate(
      { _id: objId, status: "pending" },
      {
        $set: {
          status: "rejected",
          rejected_at: new Date(),
          rejected_by_staff_id: actor.staff_id,
          reject_reason,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );
  const updated = (claim as any).value ?? claim;
  if (!updated || updated.status !== "rejected") {
    const existing = await db
      .collection(collections.TOPUP_REQUEST)
      .findOne({ _id: objId });
    if (!existing) throw new ApiError("TOPUP_REQUEST_NOT_FOUND");
    throw new ApiError("TOPUP_ALREADY_PROCESSED");
  }

  // Audit-only zero-amount transaction so the client sees the rejection
  // in their flow timeline (spec §1.1.2 / §1.3.3).
  await walletService.recordTopupRejected({
    client_id: updated.client_id,
    amount: updated.amount,
    reference_id: id,
    operator_staff_id: actor.staff_id,
    reject_reason,
  });

  return await adminGetTopupRequest(id);
}

// ── File access ─────────────────────────────────────────────────

export async function readProofFile(
  id: string,
  requester: { client_id?: string; is_admin: boolean }
): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("TOPUP_REQUEST_NOT_FOUND");
  }
  const doc = await db.collection(collections.TOPUP_REQUEST).findOne({ _id: objId });
  if (!doc) throw new ApiError("TOPUP_REQUEST_NOT_FOUND");
  if (!requester.is_admin && doc.client_id !== requester.client_id) {
    throw new ApiError("PROOF_FILE_FORBIDDEN");
  }
  const absolute = path.join(uploadsBase(), doc.proof_file_path);
  const buffer = await fs.readFile(absolute);
  return {
    buffer,
    mime: doc.proof_file_mime,
    filename: path.basename(doc.proof_file_path),
  };
}

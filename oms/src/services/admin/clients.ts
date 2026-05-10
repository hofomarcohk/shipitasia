import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { logAudit } from "@/services/audit/log";
import { redisSet } from "@/services/utils/redis";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";

export interface AdminContext {
  staff_id: string; // string id of the admin who's acting
  ip_address?: string;
  user_agent?: string;
}

const RESET_TOKEN_TTL = 60 * 60; // 1h

function projectClient(doc: any) {
  return {
    _id: doc._id?.toString(),
    email: doc.email,
    display_name: doc.display_name,
    phone: doc.phone,
    client_type: doc.client_type,
    status: doc.status,
    email_verified: doc.email_verified,
    has_local_password: !!doc.password,
    oauth_providers: (doc.oauth_providers ?? []).map((p: any) => ({
      provider: p.provider,
      linked_at: p.linked_at,
    })),
    balance: doc.balance ?? 0,
    company_info: doc.company_info ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const ListClientsInputSchema = z
  .object({
    status: z
      .enum(["pending_verification", "active", "disabled"])
      .optional(),
    client_type: z.enum(["business", "end_user"]).optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export async function listClients(raw: unknown) {
  const input = ListClientsInputSchema.parse(raw ?? {});
  const db = await connectToDatabase();
  const filter: Record<string, unknown> = {};
  if (input.status) filter.status = input.status;
  if (input.client_type) filter.client_type = input.client_type;
  if (input.search) {
    const re = new RegExp(escapeRegex(input.search), "i");
    filter.$or = [
      { email: re },
      { display_name: re },
      { phone: re },
    ];
  }
  const skip = (input.page - 1) * input.page_size;
  const total = await db.collection(collections.CLIENT).countDocuments(filter);
  const docs = await db
    .collection(collections.CLIENT)
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(input.page_size)
    .toArray();
  return {
    items: docs.map(projectClient),
    page: input.page,
    page_size: input.page_size,
    total,
    total_pages: Math.max(1, Math.ceil(total / input.page_size)),
  };
}

export async function getClient(id: string) {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("UNAUTHORIZED");
  }
  const doc = await db.collection(collections.CLIENT).findOne({ _id: objId });
  if (!doc) throw new ApiError("UNAUTHORIZED");
  return projectClient(doc);
}

export const ToggleStatusInputSchema = z
  .object({
    status: z.enum(["active", "disabled"]),
  })
  .strict();

export async function toggleClientStatus(
  id: string,
  raw: unknown,
  actor: AdminContext
) {
  const { status } = ToggleStatusInputSchema.parse(raw);
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("UNAUTHORIZED");
  }
  const before = await db.collection(collections.CLIENT).findOne({ _id: objId });
  if (!before) throw new ApiError("UNAUTHORIZED");

  await db.collection(collections.CLIENT).updateOne(
    { _id: objId },
    { $set: { status, updatedAt: new Date() } }
  );

  await logAudit({
    action: AUDIT_ACTIONS.admin_client_status_toggled,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: actor.staff_id,
    target_type: AUDIT_TARGET_TYPES.client,
    target_id: id,
    details: { from: before.status, to: status },
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return await getClient(id);
}

export async function generatePasswordResetLink(
  id: string,
  actor: AdminContext
): Promise<{ reset_url: string; expires_at: Date }> {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("UNAUTHORIZED");
  }
  const client = await db.collection(collections.CLIENT).findOne({ _id: objId });
  if (!client) throw new ApiError("UNAUTHORIZED");

  const token = crypto.randomBytes(32).toString("hex");
  await redisSet(
    "reset.password",
    token,
    { client_id: id, email: client.email },
    RESET_TOKEN_TTL
  );

  const resetBase =
    process.env.PASSWORD_RESET_BASE_URL ||
    "http://localhost:3002/zh-hk/reset-password";
  const url = `${resetBase}?token=${encodeURIComponent(token)}`;

  await logAudit({
    action: AUDIT_ACTIONS.admin_client_password_reset_link_generated,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: actor.staff_id,
    target_type: AUDIT_TARGET_TYPES.client,
    target_id: id,
    details: { email: client.email },
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return {
    reset_url: url,
    expires_at: new Date(Date.now() + RESET_TOKEN_TTL * 1000),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  CompanyInfoSchema,
  StrongPasswordSchema,
} from "@/types/Client";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import { z } from "zod";

export interface ActorContext {
  client_id: string;
  ip_address?: string;
  user_agent?: string;
}

// Public-facing projection — never leak password / legacy api tokens / etc.
function projectProfile(doc: any) {
  return {
    _id: doc._id?.toString(),
    email: doc.email,
    display_name: doc.display_name,
    phone: doc.phone,
    client_type: doc.client_type,
    company_info: doc.company_info ?? null,
    status: doc.status,
    email_verified: doc.email_verified,
    has_local_password: !!doc.password,
    oauth_providers: (doc.oauth_providers ?? []).map((p: any) => ({
      provider: p.provider,
      linked_at: p.linked_at,
    })),
    balance: doc.balance ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function getProfile(actor: ActorContext) {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.CLIENT)
    .findOne({ _id: new ObjectId(actor.client_id) });
  if (!doc) throw new ApiError("UNAUTHORIZED");
  return projectProfile(doc);
}

export const UpdateProfileInputSchema = z
  .object({
    display_name: z.string().min(1).max(100).trim().optional(),
    phone: z.string().min(1).max(40).trim().optional(),
    company_info: CompanyInfoSchema.nullable().optional(),
  })
  .strict();

export async function updateProfile(raw: unknown, actor: ActorContext) {
  const input = UpdateProfileInputSchema.parse(raw);
  if (Object.keys(input).length === 0) {
    return await getProfile(actor);
  }
  const db = await connectToDatabase();
  const objId = new ObjectId(actor.client_id);
  const before = await db.collection(collections.CLIENT).findOne({ _id: objId });
  if (!before) throw new ApiError("UNAUTHORIZED");

  // company_info is only meaningful for business clients; reject silently here
  // would mask intent — make it explicit so the UI can show a useful error.
  if (
    input.company_info !== undefined &&
    before.client_type !== "business" &&
    input.company_info != null
  ) {
    throw new ApiError("COMPANY_INFO_REQUIRED");
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of Object.keys(input) as (keyof typeof input)[]) {
    set[k] = input[k];
  }
  await db.collection(collections.CLIENT).updateOne({ _id: objId }, { $set: set });

  await logAudit({
    action: AUDIT_ACTIONS.client_profile_updated,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: actor.client_id,
    target_type: AUDIT_TARGET_TYPES.client,
    target_id: actor.client_id,
    details: { fields: Object.keys(input) },
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return await getProfile(actor);
}

export const ChangePasswordInputSchema = z
  .object({
    current_password: z.string().min(1),
    new_password: StrongPasswordSchema,
  })
  .strict();

export async function changePassword(raw: unknown, actor: ActorContext) {
  const input = ChangePasswordInputSchema.parse(raw);
  const db = await connectToDatabase();
  const objId = new ObjectId(actor.client_id);
  const doc = await db.collection(collections.CLIENT).findOne({ _id: objId });
  if (!doc) throw new ApiError("UNAUTHORIZED");
  if (!doc.password) {
    // Google-OAuth-only client → must use set-password instead
    throw new ApiError("PASSWORD_NOT_SET");
  }
  const ok = await bcrypt.compare(input.current_password, doc.password);
  if (!ok) {
    throw new ApiError("CURRENT_PASSWORD_NOT_MATCH");
  }
  const saltRounds = parseInt(process.env.PASSWORD_SALT || "10");
  const hash = await bcrypt.hash(input.new_password, saltRounds);
  await db
    .collection(collections.CLIENT)
    .updateOne({ _id: objId }, { $set: { password: hash, updatedAt: new Date() } });

  await logAudit({
    action: AUDIT_ACTIONS.client_password_changed,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: actor.client_id,
    target_type: AUDIT_TARGET_TYPES.client,
    target_id: actor.client_id,
    details: {},
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return { success: true } as const;
}

export const SetPasswordInputSchema = z
  .object({ new_password: StrongPasswordSchema })
  .strict();

export async function setLocalPassword(raw: unknown, actor: ActorContext) {
  const input = SetPasswordInputSchema.parse(raw);
  const db = await connectToDatabase();
  const objId = new ObjectId(actor.client_id);
  const doc = await db.collection(collections.CLIENT).findOne({ _id: objId });
  if (!doc) throw new ApiError("UNAUTHORIZED");
  if (doc.password) {
    throw new ApiError("PASSWORD_ALREADY_SET");
  }
  const saltRounds = parseInt(process.env.PASSWORD_SALT || "10");
  const hash = await bcrypt.hash(input.new_password, saltRounds);
  await db
    .collection(collections.CLIENT)
    .updateOne({ _id: objId }, { $set: { password: hash, updatedAt: new Date() } });

  await logAudit({
    action: AUDIT_ACTIONS.client_local_password_set,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: actor.client_id,
    target_type: AUDIT_TARGET_TYPES.client,
    target_id: actor.client_id,
    details: {},
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return { success: true } as const;
}

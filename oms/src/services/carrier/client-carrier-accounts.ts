import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { encrypt, encryptJson } from "@/lib/cryptoService";
import { logAudit } from "@/services/audit/log";
import { validateCredentials } from "@/services/carrier/validate-credentials";
import {
  ClientCarrierAccountPublic,
  projectAccount,
} from "@/types/Carrier";
import { ObjectId } from "mongodb";
import { z } from "zod";

export interface ClientContext {
  client_id: string;
  ip_address?: string;
  user_agent?: string;
}

// ── List + read ────────────────────────────────────────────────

export async function listClientAccounts(
  ctx: ClientContext
): Promise<ClientCarrierAccountPublic[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .find({ client_id: ctx.client_id, deleted_at: null })
    .sort({ is_default: -1, createdAt: -1 })
    .toArray();
  return docs.map(projectAccount);
}

export async function getClientAccount(
  id: string,
  ctx: ClientContext
): Promise<ClientCarrierAccountPublic> {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");
  }
  const doc = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .findOne({ _id: objId, client_id: ctx.client_id, deleted_at: null });
  if (!doc) throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");
  return projectAccount(doc);
}

// ── Create — api_key path (yunexpress in v1) ──────────────────

export const CreateApiKeyAccountInputSchema = z
  .object({
    carrier_code: z.string().min(1),
    nickname: z.string().min(1).max(100).trim(),
    credentials: z.record(z.string(), z.unknown()),
  })
  .strict();

export async function createApiKeyAccount(
  raw: unknown,
  ctx: ClientContext
): Promise<{ account_id: string }> {
  const input = CreateApiKeyAccountInputSchema.parse(raw);
  const db = await connectToDatabase();

  const carrier = await db
    .collection(collections.CARRIER)
    .findOne({ carrier_code: input.carrier_code });
  if (!carrier) throw new ApiError("CARRIER_NOT_FOUND");
  if (carrier.status !== "active") throw new ApiError("CARRIER_DISABLED");
  if (carrier.auth_type !== "api_key") {
    // OAuth carriers have to go through the /authorize flow
    throw new ApiError("CREDENTIALS_VALIDATION_FAILED");
  }

  const validation = validateCredentials(
    carrier.credential_fields ?? [],
    input.credentials
  );
  if (!validation.ok) {
    throw new ApiError("CREDENTIALS_VALIDATION_FAILED", {
      details: validation.errors.join("; "),
    });
  }

  // Same-client + same-carrier + same-nickname → reject
  const dup = await db.collection(collections.CLIENT_CARRIER_ACCOUNT).findOne({
    client_id: ctx.client_id,
    carrier_code: input.carrier_code,
    nickname: input.nickname,
    deleted_at: null,
  });
  if (dup) throw new ApiError("CARRIER_ACCOUNT_DUPLICATED");

  // First account for this client → mark as default automatically.
  const existingCount = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .countDocuments({ client_id: ctx.client_id, deleted_at: null });
  const isDefault = existingCount === 0;

  const credentialsEnc = encryptJson(validation.parsed);

  const now = new Date();
  const doc = {
    client_id: ctx.client_id,
    carrier_code: input.carrier_code,
    nickname: input.nickname,
    auth_type: "api_key" as const,
    credentials_enc: credentialsEnc,
    oauth_meta: null,
    is_default: isDefault,
    status: "active" as const,
    last_used_at: null,
    deleted_at: null,
    createdAt: now,
    updatedAt: now,
  };
  const ins = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .insertOne(doc as any);

  await logAudit({
    action: AUDIT_ACTIONS.client_carrier_account_created,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.carrier_account,
    target_id: ins.insertedId.toString(),
    details: {
      carrier_code: input.carrier_code,
      nickname: input.nickname,
      auth_type: "api_key",
      is_default: isDefault,
    },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return { account_id: ins.insertedId.toString() };
}

// ── Edit (nickname / set default) ──────────────────────────────

export const UpdateAccountInputSchema = z
  .object({
    nickname: z.string().min(1).max(100).trim().optional(),
    is_default: z.boolean().optional(),
  })
  .strict();

export async function updateClientAccount(
  id: string,
  raw: unknown,
  ctx: ClientContext
) {
  const input = UpdateAccountInputSchema.parse(raw);
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");
  }
  const before = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .findOne({ _id: objId, client_id: ctx.client_id, deleted_at: null });
  if (!before) throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");

  // If renaming, check duplicate within the same client+carrier scope.
  if (input.nickname && input.nickname !== before.nickname) {
    const dup = await db
      .collection(collections.CLIENT_CARRIER_ACCOUNT)
      .findOne({
        _id: { $ne: objId },
        client_id: ctx.client_id,
        carrier_code: before.carrier_code,
        nickname: input.nickname,
        deleted_at: null,
      });
    if (dup) throw new ApiError("CARRIER_ACCOUNT_DUPLICATED");
  }

  // is_default=true → clear other defaults for this client first (one
  // global default per client per spec §1.2.5 + §8.7).
  if (input.is_default === true) {
    if (before.status !== "active") {
      throw new ApiError("CARRIER_ACCOUNT_NOT_ACTIVE");
    }
    await db
      .collection(collections.CLIENT_CARRIER_ACCOUNT)
      .updateMany(
        { client_id: ctx.client_id, _id: { $ne: objId } },
        { $set: { is_default: false, updatedAt: new Date() } }
      );
    await logAudit({
      action: AUDIT_ACTIONS.client_carrier_account_set_default,
      actor_type: AUDIT_ACTOR_TYPES.client,
      actor_id: ctx.client_id,
      target_type: AUDIT_TARGET_TYPES.carrier_account,
      target_id: id,
      details: { carrier_code: before.carrier_code },
      ip_address: ctx.ip_address,
      user_agent: ctx.user_agent,
    });
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.nickname !== undefined) set.nickname = input.nickname;
  if (input.is_default !== undefined) set.is_default = input.is_default;

  await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .updateOne({ _id: objId }, { $set: set });

  if (input.nickname !== undefined && input.nickname !== before.nickname) {
    await logAudit({
      action: AUDIT_ACTIONS.client_carrier_account_updated,
      actor_type: AUDIT_ACTOR_TYPES.client,
      actor_id: ctx.client_id,
      target_type: AUDIT_TARGET_TYPES.carrier_account,
      target_id: id,
      details: {
        carrier_code: before.carrier_code,
        from_nickname: before.nickname,
        to_nickname: input.nickname,
      },
      ip_address: ctx.ip_address,
      user_agent: ctx.user_agent,
    });
  }

  return await getClientAccount(id, ctx);
}

// ── Disable / enable / soft delete ──────────────────────────────

async function transferDefaultIfLost(
  client_id: string,
  losing_account_id: ObjectId
): Promise<void> {
  const db = await connectToDatabase();
  const losing = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .findOne({ _id: losing_account_id });
  if (!losing?.is_default) return;
  await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .updateOne(
      { _id: losing_account_id },
      { $set: { is_default: false, updatedAt: new Date() } }
    );
  // Pick the earliest-created remaining active account as new default.
  const next = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .findOne(
      { client_id, status: "active", deleted_at: null, _id: { $ne: losing_account_id } },
      { sort: { createdAt: 1 } }
    );
  if (next) {
    await db
      .collection(collections.CLIENT_CARRIER_ACCOUNT)
      .updateOne(
        { _id: next._id },
        { $set: { is_default: true, updatedAt: new Date() } }
      );
  }
}

export async function disableClientAccount(id: string, ctx: ClientContext) {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");
  }
  const before = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .findOne({ _id: objId, client_id: ctx.client_id, deleted_at: null });
  if (!before) throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");

  await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .updateOne(
      { _id: objId },
      { $set: { status: "revoked", updatedAt: new Date() } }
    );
  await transferDefaultIfLost(ctx.client_id, objId);

  await logAudit({
    action: AUDIT_ACTIONS.client_carrier_account_disabled,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.carrier_account,
    target_id: id,
    details: { carrier_code: before.carrier_code, was_default: !!before.is_default },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });
  return await getClientAccount(id, ctx);
}

export async function enableClientAccount(id: string, ctx: ClientContext) {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");
  }
  const before = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .findOne({ _id: objId, client_id: ctx.client_id, deleted_at: null });
  if (!before) throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");

  await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .updateOne(
      { _id: objId },
      { $set: { status: "active", updatedAt: new Date() } }
    );

  await logAudit({
    action: AUDIT_ACTIONS.client_carrier_account_enabled,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.carrier_account,
    target_id: id,
    details: { carrier_code: before.carrier_code },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });
  return await getClientAccount(id, ctx);
}

export async function deleteClientAccount(id: string, ctx: ClientContext) {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");
  }
  const before = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .findOne({ _id: objId, client_id: ctx.client_id, deleted_at: null });
  if (!before) throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");

  const now = new Date();
  await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .updateOne(
      { _id: objId },
      { $set: { deleted_at: now, status: "revoked", updatedAt: now } }
    );
  await transferDefaultIfLost(ctx.client_id, objId);

  await logAudit({
    action: AUDIT_ACTIONS.client_carrier_account_deleted,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.carrier_account,
    target_id: id,
    details: {
      carrier_code: before.carrier_code,
      was_default: !!before.is_default,
    },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return { success: true } as const;
}

// ── Internal helper used by OAuth callback flow ────────────────

export async function writeOAuthAccount(
  ctx: ClientContext,
  input: {
    carrier_code: string;
    nickname: string;
    credentials: { access_token: string; refresh_token?: string; token_type: string };
    oauth_meta: {
      access_token_expires_at: Date;
      refresh_token_expires_at: Date;
      last_refreshed_at: Date;
      carrier_user_id?: string | null;
    };
  }
): Promise<{ account_id: string }> {
  const db = await connectToDatabase();

  const carrier = await db
    .collection(collections.CARRIER)
    .findOne({ carrier_code: input.carrier_code });
  if (!carrier) throw new ApiError("CARRIER_NOT_FOUND");
  if (carrier.auth_type !== "oauth") {
    throw new ApiError("CREDENTIALS_VALIDATION_FAILED");
  }

  const dup = await db.collection(collections.CLIENT_CARRIER_ACCOUNT).findOne({
    client_id: ctx.client_id,
    carrier_code: input.carrier_code,
    nickname: input.nickname,
    deleted_at: null,
  });
  if (dup) throw new ApiError("CARRIER_ACCOUNT_DUPLICATED");

  const existingCount = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .countDocuments({ client_id: ctx.client_id, deleted_at: null });
  const isDefault = existingCount === 0;

  const credentialsEnc = encryptJson(input.credentials);

  const now = new Date();
  const doc = {
    client_id: ctx.client_id,
    carrier_code: input.carrier_code,
    nickname: input.nickname,
    auth_type: "oauth" as const,
    credentials_enc: credentialsEnc,
    oauth_meta: input.oauth_meta,
    is_default: isDefault,
    status: "active" as const,
    last_used_at: null,
    deleted_at: null,
    createdAt: now,
    updatedAt: now,
  };

  const ins = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .insertOne(doc as any);

  await logAudit({
    action: AUDIT_ACTIONS.client_carrier_oauth_completed,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.carrier_account,
    target_id: ins.insertedId.toString(),
    details: {
      carrier_code: input.carrier_code,
      is_default: isDefault,
      mock: input.credentials.access_token.startsWith("mock_"),
    },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return { account_id: ins.insertedId.toString() };
}

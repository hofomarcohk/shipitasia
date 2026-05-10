import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { logAudit } from "@/services/audit/log";
import { CarrierSchema, OAuthConfigSchema } from "@/types/Carrier";
import { ObjectId } from "mongodb";
import { z } from "zod";

export interface AdminContext {
  staff_id: string;
  ip_address?: string;
  user_agent?: string;
}

// ── Public surface (clients use this for the dropdown) ─────────

export interface CarrierPublic {
  carrier_code: string;
  name_zh: string;
  name_en: string;
  auth_type: "api_key" | "oauth";
  logo_url: string | null;
  sort_order: number;
}

function toPublic(doc: any): CarrierPublic {
  return {
    carrier_code: doc.carrier_code,
    name_zh: doc.name_zh,
    name_en: doc.name_en,
    auth_type: doc.auth_type,
    logo_url: doc.logo_url ?? null,
    sort_order: doc.sort_order ?? 100,
  };
}

export async function listActiveCarriers(): Promise<CarrierPublic[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.CARRIER)
    .find({ status: "active" })
    .sort({ sort_order: 1, carrier_code: 1 })
    .toArray();
  return docs.map(toPublic);
}

/**
 * Returns a single active carrier with its credential_fields (for the OMS
 * client to render the dynamic api_key form). Excludes oauth_config because
 * the client doesn't need authorize_url etc — those are server-side only.
 */
export async function getCarrierFields(carrier_code: string): Promise<{
  carrier_code: string;
  name_zh: string;
  name_en: string;
  auth_type: "api_key" | "oauth";
  credential_fields: any[];
} | null> {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.CARRIER)
    .findOne({ carrier_code, status: "active" });
  if (!doc) return null;
  return {
    carrier_code: doc.carrier_code,
    name_zh: doc.name_zh,
    name_en: doc.name_en,
    auth_type: doc.auth_type,
    credential_fields: doc.credential_fields ?? [],
  };
}

// ── Admin surface ──────────────────────────────────────────────

function toAdminProjection(doc: any) {
  return {
    _id: doc._id?.toString(),
    carrier_code: doc.carrier_code,
    name_zh: doc.name_zh,
    name_en: doc.name_en,
    auth_type: doc.auth_type,
    credential_fields: doc.credential_fields ?? [],
    oauth_config: doc.oauth_config ?? null,
    base_url: doc.base_url,
    sandbox_url: doc.sandbox_url ?? null,
    logo_url: doc.logo_url ?? null,
    status: doc.status,
    sort_order: doc.sort_order,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function adminListCarriers() {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.CARRIER)
    .find({})
    .sort({ sort_order: 1, carrier_code: 1 })
    .toArray();
  return docs.map(toAdminProjection);
}

export async function adminGetCarrier(id: string) {
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("CARRIER_NOT_FOUND");
  }
  const doc = await db.collection(collections.CARRIER).findOne({ _id: objId });
  if (!doc) throw new ApiError("CARRIER_NOT_FOUND");
  return toAdminProjection(doc);
}

const BaseCarrierWriteSchema = z
  .object({
    carrier_code: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/, { message: "lowercase snake_case" }),
    name_zh: z.string().min(1),
    name_en: z.string().min(1),
    auth_type: z.enum(["api_key", "oauth"]),
    credential_fields: z.array(z.any()).default([]),
    oauth_config: z.any().nullable().optional(),
    base_url: z.string().url(),
    sandbox_url: z.string().url().nullable().optional(),
    logo_url: z.string().url().nullable().optional(),
    sort_order: z.coerce.number().int().default(100),
  })
  .strict();

export async function adminCreateCarrier(raw: unknown, actor: AdminContext) {
  const input = BaseCarrierWriteSchema.parse(raw);
  if (input.auth_type === "oauth") {
    if (!input.oauth_config) throw new ApiError("OAUTH_CONFIG_REQUIRED");
    OAuthConfigSchema.parse(input.oauth_config);
  } else {
    input.oauth_config = null;
  }

  const db = await connectToDatabase();
  const dup = await db
    .collection(collections.CARRIER)
    .findOne({ carrier_code: input.carrier_code });
  if (dup) throw new ApiError("CARRIER_CODE_DUPLICATED");

  const now = new Date();
  const doc = {
    ...input,
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
  };
  // Validate the full doc against zod to keep parity with reads
  CarrierSchema.parse(doc);
  const ins = await db.collection(collections.CARRIER).insertOne(doc as any);

  await logAudit({
    action: AUDIT_ACTIONS.admin_carrier_created,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: actor.staff_id,
    target_type: AUDIT_TARGET_TYPES.carrier,
    target_id: ins.insertedId.toString(),
    details: {
      carrier_code: input.carrier_code,
      auth_type: input.auth_type,
    },
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return await adminGetCarrier(ins.insertedId.toString());
}

const UpdateCarrierSchema = BaseCarrierWriteSchema.partial();

export async function adminUpdateCarrier(
  id: string,
  raw: unknown,
  actor: AdminContext
) {
  const input = UpdateCarrierSchema.parse(raw);
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("CARRIER_NOT_FOUND");
  }
  const before = await db.collection(collections.CARRIER).findOne({ _id: objId });
  if (!before) throw new ApiError("CARRIER_NOT_FOUND");

  // carrier_code is immutable once created — guard explicitly so a typo in
  // the client form doesn't silently mutate.
  if (input.carrier_code && input.carrier_code !== before.carrier_code) {
    throw new ApiError("CARRIER_CODE_DUPLICATED");
  }

  if (
    (input.auth_type ?? before.auth_type) === "oauth" &&
    !(input.oauth_config ?? before.oauth_config)
  ) {
    throw new ApiError("OAUTH_CONFIG_REQUIRED");
  }
  if (input.oauth_config) {
    OAuthConfigSchema.parse(input.oauth_config);
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of Object.keys(input) as (keyof typeof input)[]) {
    if (k === "carrier_code") continue;
    set[k] = input[k];
  }
  await db.collection(collections.CARRIER).updateOne({ _id: objId }, { $set: set });

  await logAudit({
    action: AUDIT_ACTIONS.admin_carrier_updated,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: actor.staff_id,
    target_type: AUDIT_TARGET_TYPES.carrier,
    target_id: id,
    details: { fields: Object.keys(input) },
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return await adminGetCarrier(id);
}

export const ToggleCarrierStatusSchema = z
  .object({ status: z.enum(["active", "disabled"]) })
  .strict();

export async function adminToggleCarrierStatus(
  id: string,
  raw: unknown,
  actor: AdminContext
) {
  const { status } = ToggleCarrierStatusSchema.parse(raw);
  const db = await connectToDatabase();
  let objId: ObjectId;
  try {
    objId = new ObjectId(id);
  } catch {
    throw new ApiError("CARRIER_NOT_FOUND");
  }
  const before = await db.collection(collections.CARRIER).findOne({ _id: objId });
  if (!before) throw new ApiError("CARRIER_NOT_FOUND");

  await db
    .collection(collections.CARRIER)
    .updateOne({ _id: objId }, { $set: { status, updatedAt: new Date() } });

  await logAudit({
    action: AUDIT_ACTIONS.admin_carrier_status_toggled,
    actor_type: AUDIT_ACTOR_TYPES.admin,
    actor_id: actor.staff_id,
    target_type: AUDIT_TARGET_TYPES.carrier,
    target_id: id,
    details: { from: before.status, to: status, carrier_code: before.carrier_code },
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return await adminGetCarrier(id);
}

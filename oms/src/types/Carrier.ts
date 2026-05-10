import { z } from "zod";

// ── credential_fields (carriers master) ──────────────────────
//
// Drives the dynamic OMS form for an api_key carrier. Each entry maps to a
// single input. `validation` is a constrained subset that maps cleanly to
// zod at write time — see services/carrier/validateCredentials.ts.

export const CredentialFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/, {
      message: "key must be snake_case",
    }),
    label_zh: z.string().min(1),
    label_en: z.string().min(1),
    type: z.enum(["text", "password", "checkbox"]),
    required: z.boolean(),
    placeholder: z.string().optional(),
    validation: z
      .object({
        pattern: z.string().optional(),
        min_length: z.number().int().min(0).optional(),
        max_length: z.number().int().min(0).optional(),
      })
      .optional(),
    is_secret: z.boolean().default(false),
  })
  .strict();
export type CredentialField = z.infer<typeof CredentialFieldSchema>;

// ── oauth_config (carriers master, oauth carrier only) ───────

export const OAuthConfigSchema = z
  .object({
    client_id_env: z.string().min(1),
    client_secret_env: z.string().min(1),
    authorize_url: z.string().url(),
    token_url: z.string().url(),
    scope: z.array(z.string()).default([]),
    redirect_path: z.string().min(1),
    extra_params: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;

// ── carriers ────────────────────────────────────────────────

export const CarrierSchema = z
  .object({
    carrier_code: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/, { message: "lowercase snake_case" }),
    name_zh: z.string().min(1),
    name_en: z.string().min(1),
    auth_type: z.enum(["api_key", "oauth"]),
    credential_fields: CredentialFieldSchema.array().default([]),
    oauth_config: OAuthConfigSchema.nullable().optional(),
    base_url: z.string().url(),
    sandbox_url: z.string().url().nullable().optional(),
    logo_url: z.string().url().nullable().optional(),
    status: z.enum(["active", "disabled"]),
    sort_order: z.number().int().default(100),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })
  .strict()
  .refine(
    (c) => c.auth_type === "api_key" || (c.auth_type === "oauth" && c.oauth_config != null),
    { message: "oauth_config required when auth_type=oauth" }
  );

export type Carrier = z.infer<typeof CarrierSchema>;

// ── client_carrier_accounts ─────────────────────────────────

export const OAuthMetaSchema = z
  .object({
    access_token_expires_at: z.date().nullable().optional(),
    refresh_token_expires_at: z.date().nullable().optional(),
    last_refreshed_at: z.date().nullable().optional(),
    carrier_user_id: z.string().nullable().optional(),
  })
  .strict();
export type OAuthMeta = z.infer<typeof OAuthMetaSchema>;

export const ClientCarrierAccountSchema = z
  .object({
    client_id: z.string().min(1),
    carrier_code: z.string().min(1),
    nickname: z.string().min(1).max(100),
    auth_type: z.enum(["api_key", "oauth"]),
    credentials_enc: z.string().min(1),
    oauth_meta: OAuthMetaSchema.nullable().optional(),
    is_default: z.boolean().default(false),
    status: z.enum(["active", "expired", "revoked"]),
    last_used_at: z.date().nullable().optional(),
    deleted_at: z.date().nullable().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })
  .strict();
export type ClientCarrierAccount = z.infer<typeof ClientCarrierAccountSchema>;

// ── public projection (never returns credentials_enc) ───────

export interface ClientCarrierAccountPublic {
  _id: string;
  carrier_code: string;
  nickname: string;
  auth_type: "api_key" | "oauth";
  is_default: boolean;
  status: "active" | "expired" | "revoked";
  last_used_at: Date | null;
  oauth_meta: {
    access_token_expires_at: Date | null;
    refresh_token_expires_at: Date | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export function projectAccount(doc: any): ClientCarrierAccountPublic {
  return {
    _id: doc._id?.toString(),
    carrier_code: doc.carrier_code,
    nickname: doc.nickname,
    auth_type: doc.auth_type,
    is_default: !!doc.is_default,
    status: doc.status,
    last_used_at: doc.last_used_at ?? null,
    oauth_meta: doc.oauth_meta
      ? {
          access_token_expires_at:
            doc.oauth_meta.access_token_expires_at ?? null,
          refresh_token_expires_at:
            doc.oauth_meta.refresh_token_expires_at ?? null,
        }
      : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

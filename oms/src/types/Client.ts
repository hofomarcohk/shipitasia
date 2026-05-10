import { utils } from "@/cst/utils";
import { z } from "zod";
import { AddressSchema } from "./Address";
import {
  ApiTokenSchema,
  ExternalTokenSchema,
  NotifyApiSchema,
  YunExpressTokenSchema,
} from "./Api";

export type ClientStatus =
  | "pending_verification"
  | "active"
  | "disabled"
  // legacy values kept so existing reads don't crash; new writes use the v1 set
  | "inactive"
  | "locked"
  | "deleted";

export type ClientRole = "admin" | "client" | "test";
export type PaymentMethod = "credit_card" | "bank_transfer" | "paypal";

export type ClientType = "business" | "end_user";
export type OAuthProvider = "google";

export const PaymentSchema = z
  .object({
    paymentMethod: z.enum(
      Object.values(utils.PAYMENT_METHODS) as [string, ...string[]]
    ),
    cardNumber: z.string().regex(/^\d{16}$/),
    cardHolder: z.string(),
    cvv: z.string().regex(/^\d{3}$/),
    expiryDate: z.string().regex(/^\d{2}\/\d{2}$/),
  })
  .strict();

export const CompanyInfoSchema = z
  .object({
    tax_id: z.string().min(1),
    invoice_title: z.string().min(1),
    invoice_address: z.string().min(1),
  })
  .strict();
export type CompanyInfo = z.infer<typeof CompanyInfoSchema>;

export const OAuthProviderLinkSchema = z
  .object({
    provider: z.enum(["google"]),
    provider_user_id: z.string().min(1),
    linked_at: z.date(),
  })
  .strict();
export type OAuthProviderLink = z.infer<typeof OAuthProviderLinkSchema>;

// Strong password rule per P1 §6.2: ≥ 8 chars, ≥ 1 letter, ≥ 1 digit
export const StrongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/\d/, "Password must contain at least one digit");

// v1 Client schema (P1 §2.1). Legacy fields kept optional for back-compat
// with the inherited code paths (apiTokens / externalTokens / addresses) so
// nothing breaks until those paths are migrated phase-by-phase.
export const ClientSchema = z
  .object({
    // ── v1 primary identity ───────────────────────────────────
    email: z.string().email(),
    password: z.string().nullable(), // bcrypt hash; null for Google-only
    client_type: z.enum(["business", "end_user"]),
    display_name: z.string().min(1).max(100),
    phone: z.string().min(1).max(40),
    company_info: CompanyInfoSchema.nullable().optional(),
    status: z.enum(["pending_verification", "active", "disabled"]),
    email_verified: z.boolean().default(false),
    terms_accepted_at: z.date(),
    oauth_providers: OAuthProviderLinkSchema.array().default([]),

    // ── reserved (Phase 3+) ───────────────────────────────────
    balance: z.number().default(0),
    preferred_carrier_code: z.string().nullable().optional(),

    // ── legacy fields (kept for inherited code paths) ─────────
    username: z.string().optional(),
    role: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    avatar: z.string().optional(),
    addresses: AddressSchema.array().default([]),
    payments: PaymentSchema.array().default([]),
    externalTokens: z
      .array(z.union([YunExpressTokenSchema, ExternalTokenSchema]))
      .default([]),
    apiTokens: ApiTokenSchema.array().default([]),
    notifyApis: NotifyApiSchema.array().default([]),

    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })
  .strict();

export type ClientContact = {
  name: string;
  phone: string;
};

export type Client = z.infer<typeof ClientSchema>;

// Lightweight projection for write paths (register, OAuth signup) where we
// don't yet hold legacy arrays. Use this to construct a new client doc; the
// full ClientSchema then validates the merged document.
export type NewClientCore = {
  email: string;
  password: string | null;
  client_type: ClientType;
  display_name: string;
  phone: string;
  company_info?: CompanyInfo | null;
  status: "pending_verification" | "active" | "disabled";
  email_verified: boolean;
  terms_accepted_at: Date;
  oauth_providers?: OAuthProviderLink[];
};

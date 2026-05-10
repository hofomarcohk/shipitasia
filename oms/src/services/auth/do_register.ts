import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { sendEmail } from "@/lib/email/resend";
import { buildVerifyEmail } from "@/lib/email/templates/verify-email";
import { redisGet, redisSet } from "@/services/utils/redis";
import { logAudit } from "@/services/audit/log";
import {
  Client,
  ClientSchema,
  CompanyInfo,
  CompanyInfoSchema,
  StrongPasswordSchema,
} from "@/types/Client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";

export const RegisterInputSchema = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    password: StrongPasswordSchema,
    client_type: z.enum(["business", "end_user"]),
    display_name: z.string().min(1).max(100).trim(),
    phone: z.string().min(1).max(40).trim(),
    company_info: CompanyInfoSchema.nullable().optional(),
    terms_accepted: z.literal(true),
  })
  .strict();

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export interface RegisterContext {
  ip_address?: string;
  user_agent?: string;
}

const VERIFY_TOKEN_TTL = 24 * 60 * 60; // 24h
const RESEND_COOLDOWN = 60; // 60s

export interface RegisterResult {
  success: true;
  message: string;
  email: string;
}

export async function registerClient(
  raw: unknown,
  ctx: RegisterContext = {}
): Promise<RegisterResult> {
  const input = RegisterInputSchema.parse(raw);

  if (input.client_type === "business" && !input.company_info) {
    throw new ApiError("COMPANY_INFO_REQUIRED");
  }

  const db = await connectToDatabase();
  const existing = await db
    .collection(collections.CLIENT)
    .findOne({ email: input.email });
  if (existing) {
    throw new ApiError("EMAIL_ALREADY_EXISTS");
  }

  // Resend cooldown check (defence in depth — also enforced before issuing
  // a fresh verify token for an already-registered-but-pending account).
  const cooling = await redisGet("verify.resend", input.email);
  if (cooling) {
    throw new ApiError("RESEND_TOO_FREQUENT");
  }

  const saltRounds = parseInt(process.env.PASSWORD_SALT || "10");
  const passwordHash = await bcrypt.hash(input.password, saltRounds);

  const now = new Date();
  const doc: Partial<Client> & { _id?: string } = {
    email: input.email,
    password: passwordHash,
    client_type: input.client_type,
    display_name: input.display_name,
    phone: input.phone,
    company_info:
      input.client_type === "business"
        ? (input.company_info as CompanyInfo)
        : null,
    status: "pending_verification",
    email_verified: false,
    terms_accepted_at: now,
    oauth_providers: [],
    balance: 0,
    addresses: [],
    payments: [],
    externalTokens: [],
    apiTokens: [],
    notifyApis: [],
    createdAt: now,
    updatedAt: now,
  };

  // Validate via the same zod schema reads use, so writes never produce a doc
  // that future reads fail to parse.
  ClientSchema.parse(doc);

  const insert = await db.collection(collections.CLIENT).insertOne(doc as any);
  const clientId = insert.insertedId.toString();

  const token = crypto.randomBytes(32).toString("hex");
  await redisSet(
    "verify.email",
    token,
    { client_id: clientId, email: input.email },
    VERIFY_TOKEN_TTL
  );
  await redisSet("verify.resend", input.email, true, RESEND_COOLDOWN);

  const verifyBase =
    process.env.EMAIL_VERIFY_BASE_URL ||
    "http://localhost:3002/zh-hk/verify-email";
  const verifyUrl = `${verifyBase}?token=${encodeURIComponent(token)}`;

  // Email send is best-effort: a Resend outage shouldn't block account creation
  // (client can ask for resend). We log audit + capture the resend_id when it
  // succeeds, log the failure when it doesn't.
  let emailResendId: string | null = null;
  try {
    const tpl = buildVerifyEmail({
      display_name: input.display_name,
      verify_url: verifyUrl,
    });
    const sent = await sendEmail({
      to: input.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    emailResendId = sent.resendId;
  } catch (err) {
    console.error("[register] verify email send failed:", (err as Error).message);
  }

  await logAudit({
    action: AUDIT_ACTIONS.client_registered,
    actor_type: AUDIT_ACTOR_TYPES.anonymous,
    actor_id: null,
    target_type: AUDIT_TARGET_TYPES.client,
    target_id: clientId,
    details: {
      email: input.email,
      client_type: input.client_type,
      email_resend_id: emailResendId,
    },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return {
    success: true,
    message: "請至信箱完成驗證",
    email: input.email,
  };
}

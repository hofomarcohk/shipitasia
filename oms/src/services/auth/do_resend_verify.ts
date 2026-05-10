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
import crypto from "crypto";
import { z } from "zod";

export const ResendVerifyInputSchema = z
  .object({ email: z.string().email().toLowerCase().trim() })
  .strict();

export interface ResendVerifyContext {
  ip_address?: string;
  user_agent?: string;
}

const VERIFY_TOKEN_TTL = 24 * 60 * 60;
const RESEND_COOLDOWN = 60;

export async function resendVerifyEmail(
  raw: unknown,
  ctx: ResendVerifyContext = {}
): Promise<{ success: true; message: string }> {
  const { email } = ResendVerifyInputSchema.parse(raw);

  // Don't leak whether the email exists: cooldown is enforced against any
  // request, account lookup happens silently, and the success response is
  // identical regardless of whether we actually sent.
  const cooling = await redisGet("verify.resend", email);
  if (cooling) throw new ApiError("RESEND_TOO_FREQUENT");
  await redisSet("verify.resend", email, true, RESEND_COOLDOWN);

  const db = await connectToDatabase();
  const client = await db.collection(collections.CLIENT).findOne({ email });

  // No account or already active → silently succeed (don't expose existence).
  if (!client || client.status !== "pending_verification") {
    return { success: true, message: "若帳號存在，驗證信已重新寄出" };
  }

  const token = crypto.randomBytes(32).toString("hex");
  await redisSet(
    "verify.email",
    token,
    { client_id: String(client._id), email: client.email },
    VERIFY_TOKEN_TTL
  );

  const verifyBase =
    process.env.EMAIL_VERIFY_BASE_URL ||
    "http://localhost:3002/zh-hk/verify-email";
  const verifyUrl = `${verifyBase}?token=${encodeURIComponent(token)}`;

  let emailResendId: string | null = null;
  try {
    const tpl = buildVerifyEmail({
      display_name: client.display_name ?? client.email,
      verify_url: verifyUrl,
    });
    const sent = await sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    emailResendId = sent.resendId;
  } catch (err) {
    console.error(
      "[resend-verify] email send failed:",
      (err as Error).message
    );
  }

  await logAudit({
    action: AUDIT_ACTIONS.client_email_verify_resent,
    actor_type: AUDIT_ACTOR_TYPES.anonymous,
    actor_id: null,
    target_type: AUDIT_TARGET_TYPES.client,
    target_id: String(client._id),
    details: { email, email_resend_id: emailResendId },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return { success: true, message: "若帳號存在，驗證信已重新寄出" };
}

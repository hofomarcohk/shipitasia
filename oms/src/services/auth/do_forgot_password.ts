import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { sendEmail } from "@/lib/email/resend";
import { buildResetPasswordEmail } from "@/lib/email/templates/reset-password";
import { redisGet, redisSet } from "@/services/utils/redis";
import { logAudit } from "@/services/audit/log";
import crypto from "crypto";
import { z } from "zod";

export const ForgotPasswordInputSchema = z
  .object({ email: z.string().email().toLowerCase().trim() })
  .strict();

export interface ForgotPasswordContext {
  ip_address?: string;
  user_agent?: string;
}

const RESET_TOKEN_TTL = 60 * 60; // 1h
const RESEND_COOLDOWN = 60;

export async function forgotPassword(
  raw: unknown,
  ctx: ForgotPasswordContext = {}
): Promise<{ success: true; message: string }> {
  const { email } = ForgotPasswordInputSchema.parse(raw);

  // 60s per-email cooldown — also enforced for non-existent emails so the
  // endpoint can't be used for timing-based account enumeration.
  const cooling = await redisGet("reset.resend", email);
  if (cooling) {
    return { success: true, message: "若帳號存在，重設信已寄出" };
  }
  await redisSet("reset.resend", email, true, RESEND_COOLDOWN);

  const db = await connectToDatabase();
  const client = await db.collection(collections.CLIENT).findOne({ email });

  // Silent succeed if no account or has no local password (Google-only).
  // Spec AC-1.7: success response is identical regardless of whether email
  // exists, to prevent enumeration.
  if (!client || client.status === "disabled" || !client.password) {
    return { success: true, message: "若帳號存在，重設信已寄出" };
  }

  const token = crypto.randomBytes(32).toString("hex");
  await redisSet(
    "reset.password",
    token,
    { client_id: String(client._id), email },
    RESET_TOKEN_TTL
  );

  const resetBase =
    process.env.PASSWORD_RESET_BASE_URL ||
    "http://localhost:3002/zh-hk/reset-password";
  const resetUrl = `${resetBase}?token=${encodeURIComponent(token)}`;

  let emailResendId: string | null = null;
  try {
    const tpl = buildResetPasswordEmail({
      display_name: client.display_name ?? client.email,
      reset_url: resetUrl,
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
      "[forgot-password] email send failed:",
      (err as Error).message
    );
  }

  await logAudit({
    action: AUDIT_ACTIONS.client_password_reset_requested,
    actor_type: AUDIT_ACTOR_TYPES.anonymous,
    actor_id: null,
    target_type: AUDIT_TARGET_TYPES.client,
    target_id: String(client._id),
    details: { email, email_resend_id: emailResendId },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return { success: true, message: "若帳號存在，重設信已寄出" };
}

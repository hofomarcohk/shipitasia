import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { redis } from "@/lib/redis";
import { redisGet } from "@/services/utils/redis";
import { logAudit } from "@/services/audit/log";
import { StrongPasswordSchema } from "@/types/Client";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import { z } from "zod";

export const ResetPasswordInputSchema = z
  .object({
    token: z.string().min(32),
    new_password: StrongPasswordSchema,
  })
  .strict();

export interface ResetPasswordContext {
  ip_address?: string;
  user_agent?: string;
}

export interface ResetPasswordResult {
  success: true;
  token: string; // JWT auto-login (per AC-1.7 implied flow)
  email: string;
}

export async function resetPassword(
  raw: unknown,
  ctx: ResetPasswordContext = {}
): Promise<ResetPasswordResult> {
  const { token, new_password } = ResetPasswordInputSchema.parse(raw);

  const cached = (await redisGet("reset.password", token)) as
    | { client_id: string; email: string }
    | null;
  if (!cached) {
    throw new ApiError("TOKEN_INVALID");
  }

  const db = await connectToDatabase();
  let clientObjId: ObjectId;
  try {
    clientObjId = new ObjectId(cached.client_id);
  } catch {
    throw new ApiError("TOKEN_INVALID");
  }
  const client = await db
    .collection(collections.CLIENT)
    .findOne({ _id: clientObjId });
  if (!client) {
    throw new ApiError("TOKEN_INVALID");
  }
  if (client.status === "disabled") {
    throw new ApiError("ACCOUNT_DISABLED");
  }

  const saltRounds = parseInt(process.env.PASSWORD_SALT || "10");
  const passwordHash = await bcrypt.hash(new_password, saltRounds);

  await db.collection(collections.CLIENT).updateOne(
    { _id: clientObjId },
    {
      $set: {
        password: passwordHash,
        updatedAt: new Date(),
        // If the account was somehow still pending_verification, completing
        // password reset implies the user has access to the email.
        ...(client.status === "pending_verification"
          ? { status: "active", email_verified: true }
          : {}),
      },
    }
  );

  // Single-use: drop the token so it can't be replayed.
  await consumeToken(token);

  const jwtToken = signJwt(cached.client_id, cached.email);

  await logAudit({
    action: AUDIT_ACTIONS.client_password_reset_completed,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: cached.client_id,
    target_type: AUDIT_TARGET_TYPES.client,
    target_id: cached.client_id,
    details: { email: cached.email },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return { success: true, token: jwtToken, email: cached.email };
}

async function consumeToken(token: string): Promise<void> {
  const r = await redis();
  const appName = process.env.APP_NAME || "app";
  const key = `${appName}-reset:password:${token}`;
  await r.del(key);
}

function signJwt(clientId: string, email: string): string {
  const secret = process.env.CMS_SECRET || "";
  if (!secret) throw new Error("CMS_SECRET not set");
  const expiresIn = process.env.CMS_JWT_EXPIRES_IN || "1d";
  return jwt.sign({ clientId, email, username: email }, secret, {
    expiresIn,
  } as jwt.SignOptions);
}

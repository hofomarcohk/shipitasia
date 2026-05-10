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
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import { z } from "zod";

export const VerifyEmailInputSchema = z
  .object({
    token: z.string().min(32),
  })
  .strict();

export type VerifyEmailInput = z.infer<typeof VerifyEmailInputSchema>;

export interface VerifyEmailContext {
  ip_address?: string;
  user_agent?: string;
}

export interface VerifyEmailResult {
  success: true;
  token: string; // JWT for auto-login (per AC-1.2)
  email: string;
}

export async function verifyEmail(
  raw: unknown,
  ctx: VerifyEmailContext = {}
): Promise<VerifyEmailResult> {
  const { token } = VerifyEmailInputSchema.parse(raw);

  // Single-use lookup: read from redis, then delete on success.
  const cached = (await redisGet("verify.email", token)) as
    | { client_id: string; email: string }
    | null;
  if (!cached) {
    // Could be expired (Redis dropped the key) or already consumed.
    // Both surfaces map to the same outward error; spec keeps them separate
    // (AC-1.2 lists TOKEN_EXPIRED and TOKEN_INVALID) but we cannot distinguish
    // server-side once the key is gone, so we standardise on TOKEN_INVALID.
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

  if (client.status === "active" && client.email_verified === true) {
    // Idempotent: already verified. Delete token, return ALREADY_ACTIVE so UI
    // can route the user to login (AC-1.2 测试 case "已 active 帳號再點").
    await consumeToken(token);
    throw new ApiError("ACCOUNT_ALREADY_ACTIVE");
  }

  // Atomic flip: only update if still pending — guards against parallel verify
  // attempts.
  const now = new Date();
  const upd = await db.collection(collections.CLIENT).updateOne(
    { _id: clientObjId, status: "pending_verification" },
    {
      $set: {
        status: "active",
        email_verified: true,
        updatedAt: now,
      },
    }
  );
  if (upd.matchedCount === 0) {
    // Someone else flipped it between our read and write; refuse and surface
    // a clear state.
    throw new ApiError("TOKEN_INVALID");
  }

  await consumeToken(token);

  const jwtToken = signJwt(cached.client_id, cached.email);

  await logAudit({
    action: AUDIT_ACTIONS.client_email_verified,
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
  const key = `${appName}-verify:email:${token}`;
  await r.del(key);
}

function signJwt(clientId: string, email: string): string {
  const secret = process.env.CMS_SECRET || "";
  if (!secret) throw new Error("CMS_SECRET not set");
  const expiresIn = process.env.CMS_JWT_EXPIRES_IN || "1d";
  // Sign with both clientId (canonical) and email (so legacy code paths that
  // read username/email from the JWT don't have to re-fetch).
  return jwt.sign({ clientId, email, username: email }, secret, {
    expiresIn,
  } as jwt.SignOptions);
}

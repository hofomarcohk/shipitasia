import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { Client } from "@/types/Client";
import bcrypt from "bcrypt";
import { createHmac, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { decrypt, encrypt } from "@/lib/cryptoService";
import { logAudit } from "@/services/audit/log";
import { mongoEdit, mongoGet } from "../utils/mongodb";
import { redisGet, redisSet } from "../utils/redis";

export interface LoginContext {
  ip_address?: string;
  user_agent?: string;
}

/**
 * Email-primary login (P1 §1.3, AC-1.4). The `identifier` parameter accepts
 * either email (the new canonical handle) or legacy `username` so any old
 * inherited UI that still posts `username` keeps working.
 */
export async function login(
  identifier: string,
  password: string,
  ctx: LoginContext = {}
) {
  const lookup = identifier.includes("@")
    ? { email: identifier.toLowerCase().trim() }
    : { username: identifier };

  const user = await mongoGet(collections.CLIENT, lookup);
  const failAudit = async (reason: string) => {
    await logAudit({
      action: AUDIT_ACTIONS.client_login_failed,
      actor_type: AUDIT_ACTOR_TYPES.anonymous,
      actor_id: user ? String(user._id) : null,
      target_type: AUDIT_TARGET_TYPES.client,
      target_id: user ? String(user._id) : "unknown",
      details: { identifier, reason },
      ip_address: ctx.ip_address,
      user_agent: ctx.user_agent,
    });
  };

  if (!user) {
    await failAudit("user_not_found");
    throw new ApiError("INVALID_CREDENTIALS");
  }
  if (!user.password) {
    // Google-OAuth-only client trying to log in with a password
    await failAudit("password_not_set");
    throw new ApiError("PASSWORD_NOT_SET");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    await failAudit("password_mismatch");
    throw new ApiError("INVALID_CREDENTIALS");
  }

  // Status gating (AC-1.4)
  if (user.status === "pending_verification") {
    await failAudit("email_not_verified");
    throw new ApiError("EMAIL_NOT_VERIFIED");
  }
  if (user.status === "disabled") {
    await failAudit("account_disabled");
    throw new ApiError("ACCOUNT_DISABLED");
  }

  const expireIn = process.env.CMS_JWT_EXPIRES_IN || "1h";
  const secret = process.env.CMS_SECRET || "";
  const cacheKey = user.email ?? user.username ?? String(user._id);
  const token = jwt.sign(
    {
      clientId: String(user._id),
      email: user.email ?? null,
      username: cacheKey, // legacy session lookup key
      client_type: user.client_type ?? null,
    },
    secret,
    { expiresIn: expireIn } as jwt.SignOptions
  );
  await redisSet("client.user", cacheKey, user);

  await logAudit({
    action: AUDIT_ACTIONS.client_logged_in,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: String(user._id),
    target_type: AUDIT_TARGET_TYPES.client,
    target_id: String(user._id),
    details: { email: user.email ?? null },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return token;
}

export async function refreshToken(username: string) {
  const user = await redisGet("client.user", username);
  const expireIn = process.env.CMS_JWT_EXPIRES_IN || "1h";
  const secret = process.env.CMS_SECRET || "";
  const token = jwt.sign({ username }, secret, {
    expiresIn: expireIn,
  });
  const key = "client.user";
  if (user) {
    await redisSet(key, username, user);
  }
  return token;
}

export async function newApiToken(username: string) {
  const apiPublicKey = randomUUID();
  const apiSecretKey = randomUUID();
  await mongoEdit(
    collections.CLIENT,
    {
      username,
    },
    {
      $push: {
        apiTokens: {
          title: "API Token",
          apiKey: apiPublicKey,
          secretKey: encrypt(apiSecretKey),
          expireAt: new Date(),
        },
      },
    }
  );

  return {
    apiKey: apiPublicKey,
    secretKey: apiSecretKey,
  };
}
export async function getCmsUserFromToken(token: string, key: string) {
  if (!token) {
    throw new ApiError("UNAUTHORIZED");
  }
  const secret = process.env.CMS_SECRET || "";
  const decoded = jwt.verify(token, secret);
  const username = (decoded as jwt.JwtPayload).username;
  const cachedUser = await redisGet(key, username);
  if (cachedUser) {
    return cachedUser;
  }

  const user = await mongoGet(collections.CLIENT, { username });
  await redisSet(key, username, user);
  return user;
}

// Api
export async function getApiToken(
  apiKey: string,
  timestamp: string,
  signature: string
) {
  const user = (await mongoGet(collections.CLIENT, {
    "apiTokens.apiKey": apiKey,
  })) as Client | null;
  if (!user) {
    throw new ApiError("INVALID_CREDENTIALS");
  }

  const apiSecret = user.apiTokens.find((token) => {
    return token.apiKey == apiKey;
  })?.secretKey;
  if (!apiSecret) {
    throw new ApiError("INVALID_CREDENTIALS");
  }

  const expireIn = process.env.CMS_JWT_EXPIRES_IN || "1h";
  const secret = process.env.API_SECRET || "";

  const decryptedSecret = decrypt(apiSecret);
  const expectedSignature = await getSignature(
    apiKey,
    timestamp,
    decryptedSecret
  );
  if (signature !== expectedSignature) {
    throw new ApiError("INVALID_CREDENTIALS");
  }

  const token = jwt.sign({ apiKey }, secret, {
    expiresIn: expireIn,
  });

  const key = "api.token";
  await redisSet(key, apiKey, user);
  return token;
}
export async function getSignature(
  apiKey: string,
  timestamp: string,
  apiSecret: string
) {
  const message = `${apiKey}.${timestamp}`;
  const signature = createHmac("sha256", apiSecret)
    .update(message)
    .digest("hex");
  return signature;
}
export async function getApiUserFromToken(token: string, key: string) {
  if (!token) {
    throw new ApiError("UNAUTHORIZED");
  }
  const secret = process.env.API_SECRET || "";
  let decoded = null;

  try {
    decoded = jwt.verify(token, secret);
  } catch (e) {
    throw new ApiError("UNAUTHORIZED");
  }
  const apiKey = (decoded as jwt.JwtPayload).apiKey;

  const cachedUser = await redisGet(key, apiKey);
  if (cachedUser) {
    return cachedUser;
  }
  const user = await mongoGet(collections.CLIENT, {
    "apiTokens.apiKey": apiKey,
  });
  await redisSet(key, apiKey, user);
  return user;
}

// WMS
export async function validteWmsToken(token: string, key: string) {
  if (!token) {
    throw new ApiError("UNAUTHORIZED");
  }
  const secret = process.env.API_SECRET || "";
  let decoded = null;

  try {
    decoded = jwt.verify(token, secret);
  } catch (e) {
    throw new ApiError("UNAUTHORIZED");
  }
  const apiKey = (decoded as jwt.JwtPayload).apiKey;

  if (apiKey != process.env.INCOMING_WMS_API_KEY) {
    throw new ApiError("UNAUTHORIZED");
  }
}

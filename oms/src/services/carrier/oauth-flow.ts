import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { logAudit } from "@/services/audit/log";
import { redisGet, redisSet } from "@/services/utils/redis";
import { writeOAuthAccount } from "@/services/carrier/client-carrier-accounts";
import crypto from "crypto";

const STATE_TTL = 10 * 60; // 10 minutes — spec §AC-2.4

export interface ClientContext {
  client_id: string;
  ip_address?: string;
  user_agent?: string;
}

interface StateData {
  client_id: string;
  carrier_code: string;
  nickname: string;
  created_at: string;
}

const isMock = () =>
  process.env.PHASE2_USE_MOCK_OAUTH === "true";

/**
 * Step 1: client clicks "Authorize via Fuuffy". We mint a state token and
 * return either:
 *   - mock mode → redirect to our internal mock-authorize page
 *   - prod mode → redirect to the carrier's authorize URL (real OAuth)
 *
 * Per Marco's pivot, prod mode is dormant in v1; the mock path is what we
 * actually exercise. We still build the prod branch so the swap is clean
 * at cutover.
 */
export async function startOAuth(
  raw: { carrier_code: string; nickname: string },
  ctx: ClientContext
): Promise<{ redirect_url: string }> {
  const carrier_code = raw.carrier_code?.trim();
  const nickname = raw.nickname?.trim();
  if (!carrier_code || !nickname) {
    throw new ApiError("CREDENTIALS_VALIDATION_FAILED", {
      details: "carrier_code and nickname are required",
    });
  }

  const db = await connectToDatabase();
  const carrier = await db
    .collection(collections.CARRIER)
    .findOne({ carrier_code });
  if (!carrier) throw new ApiError("CARRIER_NOT_FOUND");
  if (carrier.status !== "active") throw new ApiError("CARRIER_DISABLED");
  if (carrier.auth_type !== "oauth" || !carrier.oauth_config) {
    throw new ApiError("OAUTH_CONFIG_REQUIRED");
  }

  // Reject if same client/carrier/nickname already active — saves the user
  // a round trip through the authorize page just to hit a dup error.
  const dup = await db.collection(collections.CLIENT_CARRIER_ACCOUNT).findOne({
    client_id: ctx.client_id,
    carrier_code,
    nickname,
    deleted_at: null,
  });
  if (dup) throw new ApiError("CARRIER_ACCOUNT_DUPLICATED");

  const state = crypto.randomBytes(32).toString("hex");
  const data: StateData = {
    client_id: ctx.client_id,
    carrier_code,
    nickname,
    created_at: new Date().toISOString(),
  };
  await redisSet("oauth.state", state, data, STATE_TTL);

  await logAudit({
    action: AUDIT_ACTIONS.client_carrier_oauth_started,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.carrier,
    target_id: carrier_code,
    details: { mock: isMock(), nickname },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  if (isMock()) {
    const url = `/api/cms/carrier/oauth/mock-authorize?state=${encodeURIComponent(state)}`;
    return { redirect_url: url };
  }

  // Prod branch (dormant in v1 per pivot)
  const cfg = carrier.oauth_config;
  const clientId = process.env[cfg.client_id_env];
  if (!clientId) {
    throw new ApiError("OAUTH_TOKEN_EXCHANGE_FAILED", {
      details: `${cfg.client_id_env} not set in env`,
    });
  }
  const redirectUri = `${process.env.APP_URL || "http://localhost:3002"}${cfg.redirect_path}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: (cfg.scope ?? []).join(" "),
    state,
    ...(cfg.extra_params ?? {}),
  });
  const sep = cfg.authorize_url.includes("?") ? "&" : "?";
  return { redirect_url: `${cfg.authorize_url}${sep}${params.toString()}` };
}

/**
 * Step 2 (mock only): the internal mock authorize page POSTs back here with
 * action='approve' or 'deny'. We resolve the state, mint mock tokens, then
 * write the client_carrier_account.
 */
export async function completeMockOAuth(
  raw: { state: string; action: "approve" | "deny" },
  ctx: ClientContext
): Promise<{ outcome: "success" | "user_denied" }> {
  if (!isMock()) {
    throw new ApiError("FORBIDDEN", { details: "mock-only endpoint" });
  }

  const state = (raw.state ?? "").trim();
  const action = raw.action;
  if (!state) throw new ApiError("OAUTH_STATE_INVALID");

  const data = (await redisGet("oauth.state", state)) as StateData | null;
  if (!data) throw new ApiError("OAUTH_STATE_INVALID");
  // Single-use state: drop it before doing anything else.
  await consumeState(state);

  if (data.client_id !== ctx.client_id) {
    // State token belongs to someone else — refuse.
    throw new ApiError("OAUTH_STATE_INVALID");
  }

  if (action === "deny") {
    await logAudit({
      action: AUDIT_ACTIONS.client_carrier_oauth_failed,
      actor_type: AUDIT_ACTOR_TYPES.client,
      actor_id: ctx.client_id,
      target_type: AUDIT_TARGET_TYPES.carrier,
      target_id: data.carrier_code,
      details: { reason: "user_denied", mock: true },
      ip_address: ctx.ip_address,
      user_agent: ctx.user_agent,
    });
    return { outcome: "user_denied" };
  }

  // Mint mock tokens. Prefix `mock_` so prod runtime can detect and reject
  // any leftover dev data (per spec §8.1.1).
  const accessToken = "mock_fuuffy_token_" + crypto.randomBytes(16).toString("hex");
  const refreshToken =
    "mock_fuuffy_refresh_" + crypto.randomBytes(16).toString("hex");
  const now = new Date();
  const expiresIn30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiresIn365d = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  await writeOAuthAccount(ctx, {
    carrier_code: data.carrier_code,
    nickname: data.nickname,
    credentials: {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
    },
    oauth_meta: {
      access_token_expires_at: expiresIn30d,
      refresh_token_expires_at: expiresIn365d,
      last_refreshed_at: now,
      carrier_user_id: null,
    },
  });

  return { outcome: "success" };
}

async function consumeState(state: string): Promise<void> {
  // redisSet TTL is short anyway; replace with empty value + 1s TTL so we
  // don't have to import the underlying redis client.
  await redisSet("oauth.state", state, null, 1);
}

/**
 * Mock-mode helper for the GET /mock-authorize page so the page can show
 * the carrier name + scopes without re-fetching from anywhere unsafe.
 */
export async function readMockState(state: string): Promise<{
  client_id: string;
  carrier_code: string;
  carrier_name_zh: string;
  carrier_name_en: string;
  nickname: string;
  scopes: string[];
} | null> {
  if (!isMock()) return null;
  const data = (await redisGet("oauth.state", state)) as StateData | null;
  if (!data) return null;

  const db = await connectToDatabase();
  const carrier = await db
    .collection(collections.CARRIER)
    .findOne({ carrier_code: data.carrier_code });
  if (!carrier) return null;

  return {
    client_id: data.client_id,
    carrier_code: data.carrier_code,
    carrier_name_zh: carrier.name_zh,
    carrier_name_en: carrier.name_en,
    nickname: data.nickname,
    scopes: carrier.oauth_config?.scope ?? [],
  };
}

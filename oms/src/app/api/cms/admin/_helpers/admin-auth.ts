import { ApiError } from "@/app/api/api-error";
import { getCmsToken } from "@/app/api/cms/cms-middleware";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

export interface AdminPrincipal {
  staff_id: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Gate to /api/cms/admin/* — requires a JWT whose payload role marks the
 * caller as admin. v1 reuses the legacy Client.role='admin' bit until the
 * staff schema lands (Phase 5 §2.6 marks staff schema 預備).
 */
export function requireAdmin(req: NextRequest): AdminPrincipal {
  const token = getCmsToken(req);
  if (!token) throw new ApiError("UNAUTHORIZED");
  const secret = process.env.CMS_SECRET || "";
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret) as jwt.JwtPayload;
  } catch {
    throw new ApiError("UNAUTHORIZED");
  }
  // Accept either the new `role` claim or the legacy username='admin'
  // shortcut (the inherited test admin account uses username=admin).
  const role = (payload as any).role;
  const username = (payload as any).username;
  const isAdmin = role === "admin" || username === "admin";
  if (!isAdmin) throw new ApiError("FORBIDDEN");

  const staffId = String(
    (payload as any).clientId ?? (payload as any).staff_id ?? username ?? "admin"
  );
  return {
    staff_id: staffId,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent") ?? undefined,
  };
}

function ipOf(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

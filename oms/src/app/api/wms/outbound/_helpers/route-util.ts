import { ApiError } from "@/app/api/api-error";
import { getCmsToken } from "@/app/api/cms/cms-middleware";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

export interface WmsPrincipal {
  staff_id: string;
  warehouseCode: string;
  ip_address?: string;
  user_agent?: string;
}

const DEFAULT_WAREHOUSE = "JP-SAITAMA-01";

export function requireWmsStaff(req: NextRequest): WmsPrincipal {
  const token = getCmsToken(req);
  if (!token) throw new ApiError("UNAUTHORIZED");
  const secret = process.env.CMS_SECRET || "";
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret) as jwt.JwtPayload;
  } catch {
    throw new ApiError("UNAUTHORIZED");
  }
  const role = (payload as any).role;
  const username = (payload as any).username;
  const isStaff =
    role === "admin" ||
    role === "staff" ||
    role === "wms_staff" ||
    username === "admin";
  if (!isStaff) throw new ApiError("FORBIDDEN");
  const staffId = String(
    (payload as any).clientId ?? (payload as any).staff_id ?? username ?? "staff"
  );
  return {
    staff_id: staffId,
    warehouseCode: DEFAULT_WAREHOUSE,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent") ?? undefined,
  };
}

function ipOf(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

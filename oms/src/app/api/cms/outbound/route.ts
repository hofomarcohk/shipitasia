// Phase 7 rewrite — replaces the legacy POST/PUT/GET that drove the
// inherited outbound model. Legacy services in services/outbound-order/
// stay on disk (per P4 precedent "既有 endpoint 不刪") but are no longer
// called from this route.

import { getParam } from "@/app/api/api-helper";
import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import {
  createConsolidatedOutbound,
  createSingleOutbound,
  listMyOutbounds,
} from "@/services/outbound/outbound-service";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

function clientIdFromJwt(req: NextRequest): string {
  const token = getCmsToken(req);
  const payload = jwt.verify(
    token,
    process.env.CMS_SECRET || ""
  ) as jwt.JwtPayload;
  const clientId = (payload as any).clientId as string | undefined;
  if (!clientId) throw new Error("UNAUTHORIZED: token missing clientId");
  return clientId;
}

function ipOf(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const sp = new URL(request.url).searchParams;
    const statusRaw = sp.get("status");
    const status = statusRaw
      ? (statusRaw.split(",").map((s) => s.trim()).filter(Boolean) as any)
      : undefined;
    const limit = sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined;
    const offset = sp.get("offset")
      ? parseInt(sp.get("offset")!, 10)
      : undefined;
    const result = await listMyOutbounds(client_id, { status, limit, offset });
    return { status: 200, message: "Success", data: result };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const ctx = {
      client_id,
      ip_address: ipOf(request),
      user_agent: request.headers.get("user-agent") ?? undefined,
    };
    const shipment_type = body?.shipment_type;
    let data;
    if (shipment_type === "single") {
      data = await createSingleOutbound(ctx, body);
    } else {
      data = await createConsolidatedOutbound(ctx, body);
    }
    return { status: 200, message: "Success", data };
  });
}

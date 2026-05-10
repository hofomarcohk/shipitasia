import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { startOAuth } from "@/services/carrier/oauth-flow";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

function clientIdFromJwt(req: NextRequest): string {
  const token = getCmsToken(req);
  const payload = jwt.verify(
    token,
    process.env.CMS_SECRET || ""
  ) as jwt.JwtPayload;
  const clientId = payload.clientId as string | undefined;
  if (!clientId) throw new Error("UNAUTHORIZED: token missing clientId");
  return clientId;
}

function ipOf(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

// GET /api/cms/carrier/oauth/authorize?carrier_code=fuuffy&nickname=My Fuuffy
//
// Returns a 302 redirect to either:
//  - mock authorize page (/api/cms/carrier/oauth/mock-authorize?state=)
//  - real carrier authorize URL (prod)
//
// Browser navigates here directly from the modal "Authorize" button.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const carrier_code = searchParams.get("carrier_code") ?? "";
  const nickname = searchParams.get("nickname") ?? "";

  // We can't run startOAuth through cmsMiddleware because we want to return
  // a NextResponse.redirect rather than a JSON envelope. Manually validate
  // auth + dispatch.
  let client_id: string;
  try {
    client_id = clientIdFromJwt(request);
  } catch {
    return NextResponse.redirect(
      new URL("/zh-hk/login?reason=auth_required", request.url),
      302
    );
  }

  try {
    const { redirect_url } = await startOAuth(
      { carrier_code, nickname },
      {
        client_id,
        ip_address: ipOf(request),
        user_agent: request.headers.get("user-agent") ?? undefined,
      }
    );
    // mock-authorize is internal (relative path) — resolve relative to host.
    const target = redirect_url.startsWith("http")
      ? redirect_url
      : new URL(redirect_url, request.url).toString();
    return NextResponse.redirect(target, 302);
  } catch (e: any) {
    const code = e?.name ?? "OAUTH_AUTHORIZE_FAILED";
    return NextResponse.redirect(
      new URL(
        `/zh-hk/carrier-accounts?error=${encodeURIComponent(code)}`,
        request.url
      ),
      302
    );
  }
}

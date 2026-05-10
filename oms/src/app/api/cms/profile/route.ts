import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { getCmsToken } from "@/app/api/cms/cms-middleware";
import { getProfile, updateProfile } from "@/services/auth/do_profile";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

function clientIdFromJwt(req: NextRequest): string {
  auth(req);
  const token = getCmsToken(req);
  const payload = jwt.verify(
    token,
    process.env.CMS_SECRET || ""
  ) as jwt.JwtPayload;
  const clientId = payload.clientId as string | undefined;
  if (!clientId) {
    throw new Error("UNAUTHORIZED: token missing clientId");
  }
  return clientId;
}

function ipOf(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const clientId = clientIdFromJwt(request);
    const profile = await getProfile({ client_id: clientId });
    return { status: 200, message: "Success", data: profile };
  });
}

export async function PATCH(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const clientId = clientIdFromJwt(request);
    const profile = await updateProfile(body, {
      client_id: clientId,
      ip_address: ipOf(request),
      user_agent: request.headers.get("user-agent") ?? undefined,
    });
    return { status: 200, message: "Success", data: profile };
  });
}

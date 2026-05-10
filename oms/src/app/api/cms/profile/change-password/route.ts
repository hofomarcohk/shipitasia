import { getParam } from "@/app/api/api-helper";
import {
  auth,
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { changePassword } from "@/services/auth/do_profile";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  // Strip both passwords from the body shown to access logs.
  const safeBody = {
    ...body,
    current_password: "[redacted]",
    new_password: "[redacted]",
  };
  return cmsMiddleware(request, safeBody, async (): Promise<ApiReturn> => {
    auth(request);
    const token = getCmsToken(request);
    const payload = jwt.verify(token, process.env.CMS_SECRET || "") as jwt.JwtPayload;
    const clientId = payload.clientId as string;
    await changePassword(body, {
      client_id: clientId,
      ip_address: ipOf(request),
      user_agent: request.headers.get("user-agent") ?? undefined,
    });
    return { status: 200, message: "Success" };
  });
}

function ipOf(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

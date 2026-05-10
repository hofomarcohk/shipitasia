import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { resetPassword } from "@/services/auth/do_reset_password";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  // Don't echo the new_password back to access logs.
  const sanitized = { ...body, new_password: "[redacted]" };
  return cmsMiddleware(request, sanitized, async (): Promise<ApiReturn> => {
    const result = await resetPassword(body, {
      ip_address: extractIp(request),
      user_agent: request.headers.get("user-agent") ?? undefined,
    });
    return {
      status: 200,
      message: "Password reset",
      data: { email: result.email, token: result.token },
    };
  });
}

function extractIp(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

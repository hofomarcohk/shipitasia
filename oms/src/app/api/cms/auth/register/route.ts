import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { registerClient } from "@/services/auth/do_register";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const result = await registerClient(body, {
      ip_address: extractIp(request),
      user_agent: request.headers.get("user-agent") ?? undefined,
    });
    return {
      status: 200,
      message: result.message,
      data: { email: result.email },
    };
  });
}

function extractIp(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

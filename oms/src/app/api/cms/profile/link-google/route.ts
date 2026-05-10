import {
  cmsMiddleware,
} from "@/app/api/cms/cms-middleware";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

// Placeholder per Marco's pivot: real Google OAuth integration is deferred to
// prod cutover. v1 dev/staging surfaces the endpoint but always returns
// NOT_IMPLEMENTED so callers fail loudly (A2 discipline).
export async function POST(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    return {
      status: 501,
      sysCode: "9900004",
      message:
        "Google OAuth 登入即將推出。v1 階段使用 email + 密碼登入。",
    };
  });
}

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { adminListOutbounds } from "@/services/outbound/outbound-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireAdmin(request);
    const sp = new URL(request.url).searchParams;
    const statusRaw = sp.get("status");
    const status = statusRaw
      ? (statusRaw.split(",").map((s) => s.trim()).filter(Boolean) as any)
      : undefined;
    const data = await adminListOutbounds({
      client_id: sp.get("client_id") ?? undefined,
      status,
      carrier_code: sp.get("carrier_code") ?? undefined,
      held_reason: (sp.get("held_reason") ?? undefined) as any,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
      offset: sp.get("offset") ? parseInt(sp.get("offset")!, 10) : undefined,
    });
    return { status: 200, message: "Success", data };
  });
}

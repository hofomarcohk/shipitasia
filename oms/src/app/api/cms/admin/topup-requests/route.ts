import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { adminListTopupRequests } from "@/services/wallet/topup-requests";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireAdmin(request);
    const sp = new URL(request.url).searchParams;
    const result = await adminListTopupRequests({
      status: (sp.get("status") ?? undefined) as any,
      client_id: sp.get("client_id") ?? undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : undefined,
      page_size: sp.get("page_size")
        ? parseInt(sp.get("page_size")!, 10)
        : undefined,
    });
    return { status: 200, message: "Success", data: result };
  });
}

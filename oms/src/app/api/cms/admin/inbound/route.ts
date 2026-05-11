import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import {
  adminCreateInbound,
  adminListInbounds,
} from "@/services/inbound/inbound-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireAdmin(request);
    const sp = new URL(request.url).searchParams;
    const data = await adminListInbounds({
      status: sp.get("status") ?? undefined,
      client_id: sp.get("client_id") ?? undefined,
      search: sp.get("search") ?? undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : undefined,
      page_size: sp.get("page_size")
        ? parseInt(sp.get("page_size")!, 10)
        : undefined,
    });
    return { status: 200, message: "Success", data };
  });
}

// Bug 1 fix: legacy WMS POST /api/wms/inbound (route.ts:84) silently dropped
// body. This is the OMS-side admin create-on-behalf path; client_id is
// supplied in the body. v1 admin uses this from the OMS port per ADR-0001.
export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const principal = requireAdmin(request);
    const result = await adminCreateInbound(body, principal);
    return { status: 200, message: "Success", data: result };
  });
}

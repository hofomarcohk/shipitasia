import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { listInboundScans } from "@/services/scan/scan-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireStaff(request);
    const sp = new URL(request.url).searchParams;
    const data = await listInboundScans({
      inbound_id: sp.get("inbound_id") ?? undefined,
      operator_staff_id: sp.get("operator_staff_id") ?? undefined,
      type: sp.get("type") ?? undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : undefined,
      page_size: sp.get("page_size")
        ? parseInt(sp.get("page_size")!, 10)
        : undefined,
    });
    return { status: 200, message: "Success", data };
  });
}

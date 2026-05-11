import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { listUnclaimed } from "@/services/scan/scan-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireStaff(request);
    const sp = new URL(request.url).searchParams;
    const status = (sp.get("status") ?? undefined) as any;
    const data = await listUnclaimed(status);
    return { status: 200, message: "Success", data };
  });
}

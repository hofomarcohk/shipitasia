import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { listAbandonedInbounds } from "@/services/scan/scan-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireStaff(request);
    const data = await listAbandonedInbounds();
    return { status: 200, message: "Success", data };
  });
}

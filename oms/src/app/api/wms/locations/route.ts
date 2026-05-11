import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { listLocations } from "@/services/scan/locations";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const principal = requireStaff(request);
    const data = await listLocations(principal.warehouseCode);
    return { status: 200, message: "Success", data };
  });
}

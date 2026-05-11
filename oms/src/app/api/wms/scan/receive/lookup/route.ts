import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { receiveLookup } from "@/services/scan/scan-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const principal = requireStaff(request);
    const data = await receiveLookup(
      body.identifier ?? body.tracking_no ?? body.inbound_id ?? "",
      principal.warehouseCode
    );
    return { status: 200, message: "Success", data };
  });
}

import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "@/app/api/wms/outbound/_helpers/route-util";
import { palletLabelService } from "@/services/pallet/palletLabelService";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const outbound_id = String(body.outbound_id ?? "");
    if (!outbound_id) {
      return { status: 400, message: "outbound_id required" };
    }
    const data = await palletLabelService.printPallet(
      staff,
      outbound_id,
      "wms_staff"
    );
    return { status: 200, message: "Pallet label printed", data };
  });
}

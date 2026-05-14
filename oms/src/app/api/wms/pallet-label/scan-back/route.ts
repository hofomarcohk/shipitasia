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
    const pallet_no = String(body.pallet_no ?? "");
    if (!pallet_no) {
      return { status: 400, message: "pallet_no required" };
    }
    const data = await palletLabelService.scanBackPallet(staff, pallet_no);
    return { status: 200, message: "Pallet scanned back", data };
  });
}

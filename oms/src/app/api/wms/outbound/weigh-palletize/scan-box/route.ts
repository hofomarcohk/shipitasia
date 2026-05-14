import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { scanBox } from "@/services/outbound/weigh-palletize/actions";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await scanBox(staff.staff_id, staff.warehouseCode, {
      box_no: String(body.box_no || "").trim(),
    });
    return { status: 200, message: "Success", data };
  });
}

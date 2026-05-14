import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { saveBox } from "@/services/outbound/weigh-palletize/actions";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await saveBox(staff.staff_id, staff.warehouseCode, {
      box_no: String(body.box_no || "").trim(),
      length: Number(body.length),
      width: Number(body.width),
      height: Number(body.height),
      weight: Number(body.weight),
      force: !!body.force,
    });
    return { status: 200, message: "Success", data };
  });
}

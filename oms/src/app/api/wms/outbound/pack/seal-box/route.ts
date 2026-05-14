import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { sealBox } from "@/services/outbound/pack-v1/actions";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await sealBox(staff.staff_id, body.box_no, {
      width: body.width,
      length: body.length,
      height: body.height,
      weight: body.weight,
    });
    return { status: 200, message: "Success", data };
  });
}

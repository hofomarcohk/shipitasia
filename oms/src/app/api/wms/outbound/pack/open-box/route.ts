import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { openBox } from "@/services/outbound/pack-v1/actions";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await openBox(staff.staff_id, {
      inbound_id: body.inbound_id,
      outbound_id: body.outbound_id,
      from_box_no: body.from_box_no || null,
    });
    return { status: 200, message: "Success", data };
  });
}

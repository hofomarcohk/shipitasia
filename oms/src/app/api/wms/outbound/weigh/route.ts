import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../_helpers/route-util";
import { weighBox } from "@/services/outbound/wmsFlow";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await weighBox(staff, {
      box_no: body.box_no,
      actual_gross_weight: Number(body.actual_gross_weight),
      tare_weight: Number(body.tare_weight ?? 0.5),
      method: body.method === "desktop" ? "desktop" : "pda",
      override: !!body.override,
    });
    return { status: 200, message: "Weighed", data };
  });
}

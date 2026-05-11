import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../_helpers/route-util";
import { departBox } from "@/services/outbound/wmsFlow";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await departBox(staff, body.box_no);
    return { status: 200, message: "Box departed", data };
  });
}

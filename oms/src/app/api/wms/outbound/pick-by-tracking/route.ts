import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../_helpers/route-util";
import { pickByTracking } from "@/services/outbound/wmsFlow";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await pickByTracking(staff, {
      tracking_no: String(body.tracking_no ?? ""),
      locationCode: body.locationCode || undefined,
      batch_id: body.batch_id || undefined,
    });
    return { status: 200, message: "Picked", data };
  });
}

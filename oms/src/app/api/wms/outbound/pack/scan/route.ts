import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { scanItem } from "@/services/outbound/pack-v1/scan_item";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    requireWmsStaff(request);
    const data = await scanItem(body.scanCode || body.tracking_no || "");
    return { status: 200, message: "Success", data };
  });
}

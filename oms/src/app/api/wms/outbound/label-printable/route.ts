import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../_helpers/route-util";
import { listLabelPrintableOutbounds } from "@/services/outbound/wmsFlow";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await listLabelPrintableOutbounds(staff.warehouseCode);
    return { status: 200, message: "Success", data };
  });
}

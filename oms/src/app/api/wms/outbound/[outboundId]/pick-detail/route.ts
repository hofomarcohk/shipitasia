import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { getPickDetail } from "@/services/outbound/wmsFlow";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ outboundId: string }> }
) {
  const { outboundId } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireWmsStaff(request);
    const data = await getPickDetail(outboundId);
    return { status: 200, message: "Success", data };
  });
}

import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { pickInbound } from "@/services/outbound/wmsFlow";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ outboundId: string }> }
) {
  const { outboundId } = await params;
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await pickInbound(staff, {
      outbound_id: outboundId,
      inbound_id: body.inbound_id,
      locationCode: body.locationCode,
      method: body.method === "desktop_batch" ? "desktop_batch" : "pda_scan",
    });
    return { status: 200, message: "Picked", data };
  });
}

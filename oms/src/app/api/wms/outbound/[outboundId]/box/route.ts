import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { createBox, listBoxes } from "@/services/outbound/wmsFlow";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ outboundId: string }> }
) {
  const { outboundId } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireWmsStaff(request);
    const data = await listBoxes(outboundId);
    return { status: 200, message: "Success", data };
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ outboundId: string }> }
) {
  const { outboundId } = await params;
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await createBox(staff, {
      outbound_id: outboundId,
      inbound_ids: body.inbound_ids,
      dimensions: body.dimensions,
      weight_estimate: Number(body.weight_estimate),
    });
    return { status: 200, message: "Box created", data };
  });
}

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { departOutboundAll } from "@/services/outbound/wmsFlow";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ outboundId: string }> }
) {
  const { outboundId } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await departOutboundAll(staff, outboundId);
    return { status: 200, message: "Outbound departed", data };
  });
}

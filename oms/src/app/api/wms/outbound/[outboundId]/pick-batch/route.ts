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
    const ids: string[] = Array.isArray(body.inbound_ids) ? body.inbound_ids : [];
    const results: any[] = [];
    for (const id of ids) {
      const r = await pickInbound(staff, {
        outbound_id: outboundId,
        inbound_id: id,
        method: "desktop_batch",
      });
      results.push({ inbound_id: id, outbound_picked: r.outbound_picked });
    }
    return {
      status: 200,
      message: "Batch picked",
      data: { picked: results.length, results },
    };
  });
}

// app/api/submit.ts
import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { getInboundRequest } from "@/services/inbonud-order/get_inbound_order_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    let inbound_request = await getInboundRequest([]);
    return {
      status: 200,
      message: "Success",
      data: inbound_request,
    };
  });
}

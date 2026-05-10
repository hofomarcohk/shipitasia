// app/api/submit.ts
import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { OUTBOUND } from "@/cst/outbound";
import { lang } from "@/lang/base";
import { getInboundRequest } from "@/services/inbonud-order/get_inbound_order_list";
import { getOutboundRequest } from "@/services/outbound-order/get_outbound_order_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const scanCode = body.scanCode;
    const langCode = request.headers.get("lang") || "en";

    if (!scanCode) {
      throw new ApiError("MISSING_FIELD", {
        field: lang("pack.page_pack.scanCode", langCode),
      });
    }

    let outbound_request = await getOutboundRequest([
      {
        $match: {
          status: OUTBOUND.STATUS.PICKED,
        },
      },
    ]);
    return {
      status: 200,
      message: "Success",
      data: outbound_request,
    };
  });
}

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

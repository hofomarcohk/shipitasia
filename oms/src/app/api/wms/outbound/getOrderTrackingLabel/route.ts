import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { wmsMiddleware } from "@/app/api/wms/wms-middleware";
import { getOutboundRequestByOrderId } from "@/services/outbound-order/get_outbound_order_list";
import { getOutboundTracking } from "@/services/outbound-order/get_outbound_order_tracking";
import { ApiReturn } from "@/types/Api";
import { OutboundSchema } from "@/types/Outbound";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return wmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const { orderId, boxNoList } = body;
    console.log("trackingDetailstrackingDetails");

    if (!orderId || orderId === "") {
      throw new ApiError("MISSING_FIELD", { field: "orderId" });
    }

    if (!boxNoList || boxNoList.length === 0) {
      throw new ApiError("MISSING_FIELD", { field: "boxNoList" });
    }

    const { _id, ...o } = {
      _id: "",
      ...(await getOutboundRequestByOrderId(orderId)),
    };

    if (!o) {
      throw new ApiError("ORDER_NOT_FOUND");
    }
    const outboundOrder = OutboundSchema.parse(o);
    const clientId = outboundOrder.clientId;
    const trackingDetails = await getOutboundTracking(
      clientId,
      OutboundSchema.parse(outboundOrder),
      boxNoList
    );
    console.log("trackingDetailstrackingDetails", trackingDetails);

    const trackingNo = randomUUID();

    return {
      status: 200,
      message: "Success",
      data: {
        //  trackingDetails
      },
    };
  });
}

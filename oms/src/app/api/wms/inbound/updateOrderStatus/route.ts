import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { wmsMiddleware } from "@/app/api/wms/wms-middleware";
import { INBOUND } from "@/cst/inbound";
import { updateInboundStatus } from "@/services/inbonud-order/do_update_inbound_order_status";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return wmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    if (!body.orderIds || body.orderIds.length === 0) {
      throw new ApiError("MISSING_FIELD", { field: "orderIds" });
    }

    const orderStatus = Object.values(INBOUND.STATUS).find(
      (a) => a === body.status
    );
    if (!orderStatus) {
      throw new ApiError("INVALID_INBOUND_STATUS");
    }

    await updateInboundStatus(body.orderIds ?? [], orderStatus);
    return {
      status: 200,
      message: "Success",
    };
  });
}

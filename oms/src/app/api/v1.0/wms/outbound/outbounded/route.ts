import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { wmsMiddleware } from "@/app/api/v1.0/wms/wms-middleware";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return wmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    if (!body.orderIds || body.orderIds.length === 0) {
      throw new ApiError("MISSING_FIELD", { field: "orderIds" });
    }

    //  await updateInboundStatus(body.orderIds ?? [], INBOUND.STATUS.INBOUNDING);
    return {
      status: 200,
      message: "Success",
    };
  });
}

import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { wmsMiddleware } from "@/app/api/wms/wms-middleware";
import { updateInboundDimension } from "@/services/inbonud-order/do_update_inbound_order";
import { ApiReturn } from "@/types/Api";
import { DimensionSchema } from "@/types/Utils";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return wmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    if (!body.orderId || body.orderId.length === 0) {
      throw new ApiError("MISSING_FIELD", { field: "orderId" });
    }

    const dimension = body.dimension;
    DimensionSchema.parse(dimension);

    await updateInboundDimension(body.orderId, dimension);
    return {
      status: 200,
      message: "Success",
    };
  });
}

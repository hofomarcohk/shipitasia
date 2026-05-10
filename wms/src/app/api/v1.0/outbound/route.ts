import { fieldExtract, getParam } from "@/app/api/api-helper";
import { apiMiddleware } from "@/app/api/v1.0/api-middleware";
import { cancelOutbound } from "@/services/outbound-order/do_cancel_outbound_order";
import { createOutbound } from "@/services/outbound-order/do_create_outbound_order";
import { updateOutbound } from "@/services/outbound-order/do_update_outbound_order";
import { getOutboundRequest } from "@/services/outbound-order/get_outbound_order_list";
import { ApiReturn } from "@/types/Api";
import { Outbound } from "@/types/Outbound";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    let outbound_request = await getOutboundRequest([]);
    return {
      status: 200,
      message: "Success",
      data: outbound_request,
    };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    const outbound_requests = await createOutbound(body.clientId, body.data);
    return {
      status: 200,
      message: "Success",
      data: outbound_requests,
    };
  });
}

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    const recordId: string = body.data.id;
    const updateData: Partial<Outbound> = fieldExtract(body.data, [
      "warehouseCode",
      "source",
      "to",
      "width",
      "length",
      "height",
      "weight",
      "trackingNo",
      "remarks",
      "referenceNo",
    ]);

    await updateOutbound(body.clientId, recordId, updateData);
    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function DELETE(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    const recordId: string = body.id;
    await cancelOutbound(body.clientId, { offerId: recordId });
    return {
      status: 200,
      message: "Success",
    };
  });
}

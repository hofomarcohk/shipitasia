// app/api/submit.ts
import { fieldExtract, getParam } from "@/app/api/api-helper";
import { apiMiddleware } from "@/app/api/v1.0/api-middleware";
import { cancelInbound } from "@/services/inbonud-order/do_cancel_inbound_order";
import { createInbound } from "@/services/inbonud-order/do_create_inbound_order";
import { updateInbound } from "@/services/inbonud-order/do_update_inbound_order";
import { getInboundRequest } from "@/services/inbonud-order/get_inbound_order_list";
import { ApiReturn } from "@/types/Api";
import { Inbound } from "@/types/Inbound";
import { cloneDeep } from "lodash";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    let inbound_request = await getInboundRequest([]);
    return {
      status: 200,
      message: "Success",
      data: inbound_request,
    };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    const inbound_requests = await createInbound("", cloneDeep(body.data));
    return {
      status: 200,
      message: "Success",
      data: inbound_requests,
    };
  });
}

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    const recordId: string = body.data.id;

    const updateData: Partial<Inbound> = fieldExtract(body.data, [
      "category",
      "warehouseCode",
      "source",
      "to",
      "declaredValue",
      "width",
      "length",
      "height",
      "weight",
      "trackingNo",
      "restrictionTags",
      "remarks",
      "referenceNo",
      "willArriveAt",
    ]);

    await updateInbound(body.clientId, recordId, updateData);

    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function DELETE(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    const orderId: string = body.id;
    await cancelInbound(body.clientId, { orderId });
    return {
      status: 200,
      message: "Success",
    };
  });
}

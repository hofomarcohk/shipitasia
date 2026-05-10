import { getParam } from "@/app/api/api-helper";
import { apiMiddleware, getUser } from "@/app/api/v1.0/api-middleware";
import { cancelOutbound } from "@/services/outbound-order/do_cancel_outbound_order";
import { createOutbound } from "@/services/outbound-order/do_create_outbound_order";
import { updateOutbound } from "@/services/outbound-order/do_update_outbound_order";
import { getOutboundRequest } from "@/services/outbound-order/get_outbound_order_list";
import { ApiReturn } from "@/types/Api";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    let user = await getUser(request);
    let outbound_request = await getOutboundRequest([
      { $match: { clientId: user._id } },
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
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    const user = await getUser(request);
    const outbound_requests = await createOutbound(
      user._id.toString(),
      body.data
    );
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
    const user = await getUser(request);
    const orderId: string = body.data.orderId;
    await updateOutbound(user._id.toString(), orderId, body.data);

    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function DELETE(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    const user = await getUser(request);
    const recordId: string = body.id;

    await cancelOutbound(user._id.toString(), {
      _id: new ObjectId(recordId),
    });
    return {
      status: 200,
      message: "Success",
    };
  });
}

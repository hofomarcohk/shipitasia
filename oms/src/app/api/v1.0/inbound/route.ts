import { getParam } from "@/app/api/api-helper";
import { apiMiddleware, getUser } from "@/app/api/v1.0/api-middleware";
import { cancelInbound } from "@/services/inbonud-order/do_cancel_inbound_order";
import { createInbound } from "@/services/inbonud-order/do_create_inbound_order";
import { updateInbound } from "@/services/inbonud-order/do_update_inbound_order";
import { getInboundRequest } from "@/services/inbonud-order/get_inbound_order_list";
import { ApiReturn } from "@/types/Api";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    let user = await getUser(request);
    let inbound_request = await getInboundRequest([
      { $match: { clientId: user._id } },
    ]);
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
    const user = await getUser(request);
    const inbound_requests = await createInbound(
      user._id.toString(),
      body.data
    );
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
    const user = await getUser(request);
    const orderId: string = body.data.orderId;
    await updateInbound(user._id.toString(), orderId, body.data);

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

    await cancelInbound(user._id.toString(), {
      _id: new ObjectId(recordId),
    });
    return {
      status: 200,
      message: "Success",
    };
  });
}

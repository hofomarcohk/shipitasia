import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { arriveInbound } from "@/services/inbonud-order/do_arrive_inbound_order";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    await arriveInbound(user.username, { orderId: body.orderId });
    return {
      status: 200,
      message: "Success",
    };
  });
}





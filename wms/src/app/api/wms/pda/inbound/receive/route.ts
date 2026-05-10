import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { receiveInbound } from "@/services/inbonud-order/do_receive_inbound_order";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    await receiveInbound(user.username, 
      body.locationCode,
      body.orderId,
    );
    return {
      status: 200,
      message: "Success",
    };
  });
}

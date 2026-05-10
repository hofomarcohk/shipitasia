import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { selectPickOutboundTask } from "@/services/outbound-order/do_select_pick_outbound_task";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    // validate role
    auth(request);

    const { orderId } = body;
    const user = await getUser(request);

    // handle select outbound task
    await selectPickOutboundTask(user.username, orderId);

    return {
      status: 200,
      message: "Success",
    };
  });
}

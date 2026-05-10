import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { deselectPickOutboundTask } from "@/services/outbound-order/do_deselect_pick_outbound_task";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    // validate role
    auth(request);

    const { orderId } = body;
    const user = await getUser(request);

    // handle deselect outbound task
    await deselectPickOutboundTask(user.username, orderId);

    return {
      status: 200,
      message: "Success",
    };
  });
}

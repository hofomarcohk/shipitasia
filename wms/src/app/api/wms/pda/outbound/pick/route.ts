import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { pickOutbound } from "@/services/outbound-order/do_pick_outbound_order";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    const { locationCode, orderId } = body;
    // validate role
    return {
      status: 200,
      message: "Success",
      data: {
        results: await pickOutbound(
          user.username,
          user.warehouseCode,
          locationCode,
          orderId
        ),
      },
    };
  });
}

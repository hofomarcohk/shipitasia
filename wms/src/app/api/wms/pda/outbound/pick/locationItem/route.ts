import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { getOutboundPickLocationItemList } from "@/services/outbound-order/get_outbound_order_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    const { locationCode, pageNo, itemCode } = body;
    // validate role
    return {
      status: 200,
      message: "Success",
      data: {
        results: await getOutboundPickLocationItemList(
          user.username,
          user.warehouseCode,
          locationCode,
          itemCode,
          pageNo
        ),
      },
    };
  });
}

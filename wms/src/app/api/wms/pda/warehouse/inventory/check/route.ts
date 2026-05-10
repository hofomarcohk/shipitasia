import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { getInboundRequest } from "@/services/inbonud-order/get_inbound_order_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    // validate role
    const user = await getUser(request);
    const page = body.page || 1;
    const size = body.size || 10;
    const pipeline = [
      {
        $match: {
          $or: [{ trackingNo: body.itemCode }, { orderId: body.itemCode }],
          warehouseCode: user.warehouseCode,
        },
      },
      {
        $lookup: {
          from: "item_locations",
          localField: "orderId",
          foreignField: "itemCode",
          as: "item_locations",
        },
      },
      {
        $unwind: {
          path: "$item_locations",
        },
      },
      {
        $project: {
          trackingNo: "$trackingNo",
          orderId: "$orderId",
          to: "$to",
          locationCode: "$item_locations.locationCode",
        },
      },
      {
        $skip: (page - 1) * size,
      },
      {
        $limit: size,
      },
    ];
    const results = await getInboundRequest(pipeline);

    return {
      status: 200,
      message: "Success",
      data: {
        results,
      },
    };
  });
}

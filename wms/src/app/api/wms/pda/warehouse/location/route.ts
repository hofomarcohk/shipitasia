import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { WAREHOUSE } from "@/cst/warehouse";
import { aggItemLocations } from "@/services/inventory/get_item_locations";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request); // validate role

    const user = await getUser(request);
    const page = body.page || 1;
    const size = body.size || 10;
    const results = await aggItemLocations([
      {
        $match: {
          locationCode: body.locationCode,
          warehouseCode: user.warehouseCode,
          itemType: WAREHOUSE.ITEM_TYPE.SHIPMENT,
        },
      },
      {
        $lookup: {
          from: "inbound_requests",
          localField: "itemCode",
          foreignField: "orderId",
          as: "inbound_requests",
        },
      },
      {
        $unwind: {
          path: "$inbound_requests",
        },
      },
      {
        $project: {
          trackingNo: "$inbound_requests.trackingNo",
          orderId: "$inbound_requests.orderId",
          to: "$inbound_requests.to",
          locationCode: "$locationCode",
        },
      },
      {
        $skip: (page - 1) * size,
      },
      {
        $limit: size,
      },
    ]);

    return {
      status: 200,
      message: "Success",
      data: {
        results,
      },
    };
  });
}

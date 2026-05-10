import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { lang } from "@/lang/base";
import { getInboundRequest } from "@/services/inbonud-order/get_inbound_order_list";
import { moveInventory } from "@/services/warehouse/do_move_inventory";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    // validate role
    // check item available

    // {
    //   warehouseCode: user?.warehouseCode,
    //   locationCode: locationCode,
    //   itemCode: searchItemCode,
    // }

    const { locationCode, itemCode } = body;
    const user = await getUser(request);

    const results = await getInboundRequest([
      {
        $match: {
          $or: [{ trackingNo: itemCode }, { orderId: itemCode }],
          warehouseCode: user.warehouseCode,
        },
      },
      {
        $lookup: {
          from: "item_locations",
          localField: "orderId",
          foreignField: "itemCode",
          as: "item_locations",
          pipeline: [
            {
              $match: {
                locationCode: locationCode,
              },
            },
          ],
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
    ]);

    return {
      status: 200,
      message: "Success",
      data: { results },
    };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    // validate role
    const { orderId, locationCode } = body;
    const user = await getUser(request);

    // handle take item
    await moveInventory(user.username, orderId, locationCode, user.username);

    return {
      status: 200,
      message: lang("pda.inventory.get.success", user.langCode),
    };
  });
}

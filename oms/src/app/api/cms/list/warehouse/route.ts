import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { getWarehouse } from "@/services/warehouse/get_warehouse_list";
import { ApiReturn } from "@/types/Api";
import { OptionItemList } from "@/types/Utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request);
    let results: OptionItemList = (
      await getWarehouse([
        {
          $match: {
            deletedAt: { $exists: false },
          },
        },
        {
          $sort: {
            warehouseCode: 1,
          },
        },
        {
          $project: {
            value: "$warehouseCode",
            label: "$warehouseCode",
          },
        },
        {
          $project: {
            _id: 0,
          },
        },
      ])
    ).map((item) => ({
      value: item.value,
      label: item.label,
    }));

    return {
      status: 200,
      message: "Success",
      data: {
        results,
      },
    };
  });
}

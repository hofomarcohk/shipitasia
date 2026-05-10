import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { getWarehouseOptions } from "@/services/warehouse/get_warehouse_list";
import { ApiReturn } from "@/types/Api";
import { OptionItemList } from "@/types/Utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request);
    let results: OptionItemList = await getWarehouseOptions();

    return {
      status: 200,
      message: "Success",
      data: { results },
    };
  });
}

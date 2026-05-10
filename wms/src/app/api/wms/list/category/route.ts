import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { langCode } from "@/app/helpers/request";
import { getCategoryOptions } from "@/services/category/get_category_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request);
    let results = await getCategoryOptions(langCode(param.locale));
    return {
      status: 200,
      message: "Success",
      data: { results },
    };
  });
}

import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/cms/cms-middleware";
import { utils } from "@/cst/utils";
import { getYunProduct } from "@/services/api/handle_yun_api";
import { ApiReturn } from "@/types/Api";
import { OptionItem } from "@/types/Utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request);
    const langCode = utils.LANG_CODES.includes(param.lang ?? "")
      ? param.lang
      : "en";
    const user = await getUser(request);

    const service = param.service ?? "";
    let results: OptionItem[] = [];
    switch (service) {
      case "yunexpress":
        try {
          const services = await getYunProduct(user._id.toString(), langCode);
          results = services.responseJson.detail
            .map((item: any) => {
              return {
                value: item.product_code,
                label: item.product_name,
              };
            })
            .sort((a: any, b: any) => a.label.localeCompare(b.label));
        } catch (e) {}

        break;
    }

    return {
      status: 200,
      message: "Success",
      data: {
        results,
      },
    };
  });
}

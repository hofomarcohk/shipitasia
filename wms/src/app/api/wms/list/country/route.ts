import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { utils } from "@/cst/utils";
import { getCountry } from "@/services/country/get_country_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request);
    const langCode = utils.LANG_CODES.includes(param.locale ?? "")
      ? param.locale
      : "en";

    let results = await getCountry([
      {
        $match: {
          deletedAt: { $exists: false },
        },
      },
      {
        $project: {
          value: "$countryKey",
          label: "$text." + langCode,
        },
      },
      {
        $project: {
          _id: 0,
        },
      },
      {
        $sort: {
          value: 1,
        },
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

import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { utils } from "@/cst/utils";
import { getRestriction } from "@/services/restriction/get_restriction_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request);
    const langCode = utils.LANG_CODES.includes(param.lang ?? "")
      ? param.lang
      : "en";

    let results = await getRestriction([
      {
        $match: {
          deletedAt: { $exists: false },
        },
      },
      {
        $sort: {
          "text.en": 1,
        },
      },
      {
        $project: {
          value: "$restrictionKey",
          label: "$text." + langCode,
        },
      },
      {
        $project: {
          _id: 0,
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

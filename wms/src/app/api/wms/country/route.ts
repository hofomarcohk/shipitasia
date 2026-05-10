import { getParam, matchBuilder, sortBuilder } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { createCountry } from "@/services/country/do_create_country";
import { updateCountry } from "@/services/country/do_update_country";
import { countCountry, getCountry } from "@/services/country/get_country_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request);
    const { pageSize, pageNo, ...filter } = param;

    const sort = sortBuilder(param, ["updatedAt"]);

    const match = {
      ...matchBuilder(param, {
        search: {
          type: "search",
          field: ["countryKey", "text.en", "text.zh_hk", "text.zh_cn"],
        },
      }),
      deletedAt: { $exists: false },
    };

    let count = await countCountry(match);
    let results = await getCountry([
      {
        $match: match,
      },
      {
        $sort: sort,
      },
      {
        $skip: (Number(pageNo) - 1) * Number(pageSize),
      },
      {
        $limit: Number(pageSize),
      },
    ]);

    return {
      status: 200,
      message: "Success",
      data: {
        count,
        results,
      },
    };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    return {
      status: 200,
      message: "Success",
      data: await createCountry(user._id.toString(), [
        {
          ...body,
          createdBy: user._id.toString(),
          createdAt: new Date(),
          updatedBy: user._id.toString(),
          updatedAt: new Date(),
        },
      ]),
    };
  });
}

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    const { _id, ...update } = body;
    return {
      status: 200,
      message: "Success",
      data: await updateCountry(user._id.toString(), _id, update),
    };
  });
}

export async function DELETE(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    return {
      status: 200,
      message: "Success",
      data: await updateCountry(user._id.toString(), body._id, {
        deletedAt: new Date(),
      }),
    };
  });
}

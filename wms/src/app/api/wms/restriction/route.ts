import { getParam, matchBuilder, sortBuilder } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { createRestriction } from "@/services/restriction/do_create_restriction";
import { updateRestriction } from "@/services/restriction/do_update_restriction";
import {
  countRestriction,
  getRestriction,
} from "@/services/restriction/get_restriction_list";
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
          field: ["restrictionKey", "text.en", "text.zh_hk", "text.zh_cn"],
        },
      }),
      deletedAt: { $exists: false },
    };

    let count = await countRestriction(match);
    let results = await getRestriction(match, sort, pageNo, pageSize);

    return {
      status: 200,
      message: "Success",
      data: { count, results },
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
      data: await createRestriction(user._id.toString(), [
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
    return {
      status: 200,
      message: "Success",
      data: await updateRestriction(user._id.toString(), body._id, {
        ...body,
        updatedBy: user._id.toString(),
        updated_at: new Date(),
      }),
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
      data: await updateRestriction(user._id.toString(), body._id, {
        deletedAt: new Date(),
      }),
    };
  });
}

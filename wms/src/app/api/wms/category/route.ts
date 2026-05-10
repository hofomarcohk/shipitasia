import { getParam, matchBuilder, sortBuilder } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { createCategory } from "@/services/category/do_create_category";
import { updateCategory } from "@/services/category/do_update_category";
import {
  countCategory,
  getCategory,
} from "@/services/category/get_category_list";
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
          field: ["categoryKey", "text.en", "text.zh_hk", "text.zh_cn"],
        },
      }),
      deletedAt: { $exists: false },
    };

    let count = await countCategory(match);
    let results = await getCategory(match, sort, pageNo, pageSize);

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
    await createCategory(user._id.toString(), [
      {
        ...body,
        createdBy: user._id.toString(),
        updatedBy: user._id.toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    const { _id, ...update } = body;
    await updateCategory(user._id.toString(), _id, update);
    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function DELETE(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    await updateCategory(user._id.toString(), body._id, {
      deletedAt: new Date(),
    });
    return {
      status: 200,
      message: "Success",
    };
  });
}

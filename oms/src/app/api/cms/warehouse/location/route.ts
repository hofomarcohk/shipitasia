import { getParam, matchBuilder, sortBuilder } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/cms/cms-middleware";
import { createLocation } from "@/services/warehouse/do_create_location";
import { updateLocation } from "@/services/warehouse/do_update_location";
import {
  countLocation,
  getLocation,
} from "@/services/warehouse/get_location_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request);
    const { pageSize, pageNo } = param;

    const sort = sortBuilder(param, [
      "locationCode",
      "warehouseCode",
      "updatedAt",
    ]);
    const match = {
      ...matchBuilder(param, {
        search: {
          type: "search",
          field: ["locationCode"],
        },
        locationCode: {
          type: "in",
          field: ["locationCode"],
        },
        warehouseCode: {
          type: "in",
          field: "warehouseCode",
        },
      }),
      deletedAt: { $exists: false },
    };
    let count = await countLocation(match);
    let results = await getLocation([
      {
        $match: match,
      },
      {
        $sort: sort,
      },
      {
        $skip: Number((pageNo || 1) - 1) * Number(pageSize || 10),
      },
      {
        $limit: Number(pageSize || 10),
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
      data: await createLocation(user._id.toString(), [
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
      data: await updateLocation(user._id.toString(), _id, update),
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
      data: await updateLocation(user._id.toString(), body._id, {
        deletedAt: new Date(),
      }),
    };
  });
}

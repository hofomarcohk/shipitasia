import { getParam, matchBuilder, sortBuilder } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/cms/cms-middleware";
import { createWarehouse } from "@/services/warehouse/do_create_warehouse";
import { updateWarehouse } from "@/services/warehouse/do_update_warehouse";
import {
  countWarehouse,
  getWarehouse,
} from "@/services/warehouse/get_warehouse_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request);
    const pageSize = Number(param.pageSize || "10");
    const pageNo = Number(param.pageNo || "1");
    const sort = sortBuilder(param, ["warehouseCode", "name", "updatedAt"]);
    const match = {
      ...matchBuilder(param, {
        search: {
          type: "search",
          field: ["warehouseCode", "name"],
        },
        "address.country": {
          type: "in",
          field: "address.country",
        },
      }),
      deletedAt: { $exists: false },
    };

    let count = await countWarehouse(match);
    let results = await getWarehouse([
      {
        $match: match,
      },
      {
        $sort: sort,
      },
      {
        $skip: (pageNo - 1) * pageSize,
      },
      {
        $limit: pageSize,
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
      data: await createWarehouse(user._id.toString(), [
        {
          warehouseCode: body.warehouseCode,
          name: body.name,
          address: body.address,
          createdBy: user._id.toString(),
          updatedBy: user._id.toString(),
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
      data: await updateWarehouse(user._id.toString(), body._id, {
        warehouseCode: body.warehouseCode,
        name: body.name,
        address: body.address,
        updatedBy: user._id.toString(),
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
      data: await updateWarehouse(user._id.toString(), body.data.id, {
        deletedAt: new Date(),
      }),
    };
  });
}

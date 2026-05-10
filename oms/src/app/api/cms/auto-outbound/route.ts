import { getParam, matchBuilder, sortBuilder } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/cms/cms-middleware";
import { createAutoOutbound } from "@/services/auto-outbound/do_create_auto_outbound";
import { deleteAutoOutbound } from "@/services/auto-outbound/do_delete_auto_outbound";
import { updateAutoOutbound } from "@/services/auto-outbound/do_update_auto_outbound";
import {
  countAutoOutbound,
  getAutoOutbound,
} from "@/services/auto-outbound/get_auto_outbound_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request, "login");
    const pageSize = Number(param.pageSize || "10");
    const pageNo = Number(param.pageNo || "1");
    const sort = sortBuilder(param, ["updatedAt"]);
    const match = {
      ...matchBuilder(param, {
        search: {
          type: "search",
          field: ["name", "recordId"],
        },
        warehouseCode: {
          type: "in",
          field: "warehouseCode",
        },
        isActive: {
          type: "in_boolean",
          field: "isActive",
        },
      }),
      deletedAt: { $exists: false },
    };
    let count = await countAutoOutbound(match);
    let results = await getAutoOutbound([
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
    const user = await getUser(request);
    delete body._id;
    await createAutoOutbound(user._id.toString(), [
      {
        ...body,

        to: {
          contactPerson: body?.to?.contactPerson ?? "",
          mobile: body?.to?.mobile ?? "",
          country: body?.to?.country ?? "",
          region: body?.to?.region ?? "",
          state: body?.to?.state ?? "",
          city: body?.to?.city ?? "",
          district: body?.to?.district ?? "",
          address: body?.to?.address ?? "",
          zip: body?.to?.zip ?? "",
        },
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
    const user = await getUser(request);
    delete body._id;
    delete body.createdAt;
    await updateAutoOutbound(user._id.toString(), body.orderId, {
      ...body,
      to: {
        contactPerson: body?.to?.contactPerson ?? "",
        mobile: body?.to?.mobile ?? "",
        country: body?.to?.country ?? "",
        city: body?.to?.city ?? "",
        region: body?.to?.region ?? "",
        district: body?.to?.district ?? "",
        state: body?.to?.state ?? "",
        address: body?.to?.address ?? "",
        zip: body?.to?.zip ?? "",
      },
    });
    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function DELETE(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const user = await getUser(request);

    await deleteAutoOutbound(user.id, {
      recordId: body.recordId,
    });
    return {
      status: 200,
      message: "Success",
    };
  });
}

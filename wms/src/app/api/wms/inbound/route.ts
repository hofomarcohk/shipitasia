// app/api/submit.ts
import {
  getLang,
  getParam,
  matchBuilder,
  sortBuilder,
} from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { lang } from "@/lang/base";
import { updateInbound } from "@/services/inbonud-order/do_update_inbound_order";
import {
  countInboundRequest,
  getInboundRequest,
} from "@/services/inbonud-order/get_inbound_order_list";
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
          field: ["trackingNo", "orderId"],
        },
        scan: {
          type: "in",
          field: ["trackingNo", "orderId"],
        },
        status: {
          type: "in",
          field: "status",
        },
        warehouseCode: {
          type: "in",
          field: "warehouseCode",
        },
        category: {
          type: "in",
          field: "category",
        },
        restrictionTags: {
          type: "in",
          field: "restrictionTags",
        },
        xOrderId: {
          type: "nin",
          field: "orderId",
        },
      }),
      deletedAt: { $exists: false },
    };
    let count = await countInboundRequest(match);
    let results = await getInboundRequest([
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
    let inbound_request = await getInboundRequest([]);
    return {
      status: 200,
      message: "Success",
      data: inbound_request,
    };
  });
}

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const user = await getUser(request);
    const langCode = await getLang(request);
    delete body._id;
    delete body.isCustomToAddress;
    delete body.isAddFromAddress;
    delete body.createdAt;
    delete body.toFullAddress;

    if (!body.willArrivedAt) {
      delete body.willArrivedAt;
    }
    await updateInbound(user._id, body.orderId, {
      ...body,
      from: {
        contactPerson: body?.from?.contactPerson ?? "",
        mobile: body?.from?.mobile ?? "",
        country: body?.from?.country ?? "",
        city: body?.from?.city ?? "",
        region: body?.from?.region ?? "",
        district: body?.from?.district ?? "",
        state: body?.from?.state ?? "",
        address: body?.from?.address ?? "",
        zip: body?.from?.zip ?? "",
      },
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
      declaredValue: parseInt(body.declaredValue) || 0,
      width: parseFloat(body.width) || 0,
      height: parseFloat(body.height) || 0,
      length: parseFloat(body.length) || 0,
      weight: parseFloat(body.weight) || 0,
      arrivedAt: body.arrivedAt && new Date(body.arrivedAt),
      willArrivedAt: body.willArrivedAt && new Date(body.willArrivedAt),
      updatedAt: new Date(),
    });

    console.log("langCodelangCode", langCode);
    return {
      status: 200,
      message: lang("utils.updateSuccess", langCode),
    };
  });
}

export async function DELETE(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    let inbound_request = await getInboundRequest([]);
    return {
      status: 200,
      message: "Success",
      data: inbound_request,
    };
  });
}

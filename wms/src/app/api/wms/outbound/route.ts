// app/api/submit.ts
import { getParam, matchBuilder, sortBuilder } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { getInboundRequest } from "@/services/inbonud-order/get_inbound_order_list";
import {
  countOutboundRequest,
  getOutboundRequest,
} from "@/services/outbound-order/get_outbound_order_list";
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
    let count = await countOutboundRequest(match);
    let results = await getOutboundRequest([
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
    let inbound_request = await getInboundRequest([]);
    return {
      status: 200,
      message: "Success",
      data: inbound_request,
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

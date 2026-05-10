import { getParam, matchBuilder, sortBuilder } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/cms/cms-middleware";
import { lang } from "@/lang/base";
import { getInboundRequest } from "@/services/inbonud-order/get_inbound_order_list";
import { createOutbound } from "@/services/outbound-order/do_create_outbound_order";
import { updateOutbound } from "@/services/outbound-order/do_update_outbound_order";
import {
  countOutboundRequest,
  getOutboundRequest,
  getOutboundRequestByOrderId,
} from "@/services/outbound-order/get_outbound_order_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";
import { ApiError } from "../../api-error";

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
    const headers = request.headers;
    const langCode = headers.get("langCode") || "en";
    const user = await getUser(request);
    delete body._id;

    delete body.addresses;
    delete body.n;
    delete body.isCustomToAddress;

    const inboundRequestIds = body.inboundRequestIds;
    const inboundRequests = await getInboundRequest([
      {
        $match: {
          orderId: {
            $in: inboundRequestIds,
          },
        },
      },
    ]);

    let error: string[] = [];
    inboundRequests.map((inboundRequest) => {
      if (inboundRequest.declaredValue <= 0) {
        error.push(
          inboundRequest.orderId +
            ":" +
            lang("error.MISSING_DECLARED_VALUE", langCode)
        );
      }
      if (!inboundRequest.category || inboundRequest.category?.length == 0) {
        error.push(
          inboundRequest.orderId +
            ":" +
            lang("error.MISSING_CATEGORY", langCode)
        );
      }
    });
    if (error.length > 0) {
      throw new ApiError("FAIL_TO_CREATE_OUTBOUND_ORDER", {
        langCode,
        error: error.join("\n"),
      });
    }

    await createOutbound(user._id.toString(), [{ ...body, source: "cms" }]);

    return {
      status: 200,
      message: "Success",
      data: { inboundRequests },
    };
  });
}

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    delete body._id;
    delete body.createdAt;

    const user = await getUser(request);
    const orderId: string = body.orderId;

    if (!orderId) {
      throw new ApiError("MISSING_FIELD", { langCode: "en", field: "orderId" });
    }

    const order = await getOutboundRequestByOrderId(orderId);
    if (!order) {
      throw new ApiError("OUTBOUND_NOT_FOUND", { langCode: "en", orderId });
    }
    if (order.status != "prending") {
      throw new ApiError("INVALID_OUTBOUND_STATUS", { status: order.status });
    }

    await updateOutbound(user._id.toString(), orderId, {
      to: body.to,
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
    let inbound_request = await getInboundRequest([]);
    return {
      status: 200,
      message: "Success",
      data: inbound_request,
    };
  });
}

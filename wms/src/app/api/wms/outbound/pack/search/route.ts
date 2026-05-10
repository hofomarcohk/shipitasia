// app/api/submit.ts
import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { OUTBOUND } from "@/cst/outbound";
import { lang } from "@/lang/base";
import { getInboundRequest } from "@/services/inbonud-order/get_inbound_order_list";
import { getOutboundRequest } from "@/services/outbound-order/get_outbound_order_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const scanCode = body.scanCode;
    const langCode = request.headers.get("lang") || "en";

    if (!scanCode) {
      throw new ApiError("MISSING_FIELD", {
        field: lang("pack.page_pack.scanCode", langCode),
      });
    }

    const availableStatus = [
      OUTBOUND.STATUS.PICKED,
      OUTBOUND.STATUS.PACKING,
      OUTBOUND.STATUS.PACKED,
    ];

    const outbound_request = await getOutboundRequest([
      {
        $match: {
          status: { $in: availableStatus },
          $or: [
            { trackingNo: { $regex: scanCode, $options: "i" } },
            { orderId: { $regex: scanCode, $options: "i" } },
          ],
        },
      },
      {
        $project: {
          orderId: 1,
          contactPerson: "$to.contactPerson",
          fullAddress: {
            $concat: [
              "$to.address",
              ", ",
              "$to.district",
              ", ",
              "$to.region",
              ", ",
              "$to.city",
              ", ",
              "$to.country",
            ],
          },
          inboundRequestIds: 1,
        },
      },
      {
        $lookup: {
          from: "inbound_requests",
          localField: "inboundRequestIds",
          foreignField: "orderId",
          as: "items",
          pipeline: [{ $project: { orderId: 1, trackingNo: 1 } }],
        },
      },
      {
        $lookup: {
          from: "outbound_boxes",
          localField: "orderId",
          foreignField: "orderId",
          as: "outboundBoxes",
        },
      },
    ]);
    const outbound_request_from_inbound = await getInboundRequest([
      {
        $match: {
          $or: [
            { trackingNo: { $regex: scanCode, $options: "i" } },
            { orderId: { $regex: scanCode, $options: "i" } },
          ],
        },
      },
      {
        $lookup: {
          from: "outbound_requests",
          localField: "orderId",
          foreignField: "inboundRequestIds",
          as: "outboundRequests",
          pipeline: [{ $match: { status: { $in: availableStatus } } }],
        },
      },
      {
        $unwind: {
          path: "$outboundRequests",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          orderId: "$outboundRequests.orderId",
          contactPerson: "$outboundRequests.to.contactPerson",
          fullAddress: {
            $concat: [
              "$outboundRequests.to.address",
              ", ",
              "$outboundRequests.to.district",
              ", ",
              "$outboundRequests.to.region",
              ", ",
              "$outboundRequests.to.city",
              ", ",
              "$outboundRequests.to.country",
            ],
          },
          inboundRequestIds: "$outboundRequests.inboundRequestIds",
        },
      },
      {
        $lookup: {
          from: "inbound_requests",
          localField: "inboundRequestIds",
          foreignField: "orderId",
          as: "items",
          pipeline: [{ $project: { orderId: 1, trackingNo: 1 } }],
        },
      },
      {
        $lookup: {
          from: "outbound_boxes",
          localField: "orderId",
          foreignField: "orderId",
          as: "outboundBoxes",
        },
      },
    ]);

    return {
      status: 200,
      message: "Success",
      data: [...outbound_request, ...outbound_request_from_inbound],
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

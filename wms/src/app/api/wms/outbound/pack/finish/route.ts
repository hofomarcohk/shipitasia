// app/api/submit.ts
import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import {
  packFinish,
  updatePackBoxDimensions,
} from "@/services/outbound-order/do_pack_outbound_order";
import { findOutboundByOrderId } from "@/services/outbound-order/getter";
import { ApiReturn } from "@/types/Api";
import { PackBox } from "@/types/Outbound";
import { Dimension } from "@/types/Utils";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    const orderId = body.orderId;
    const dimensions = body.boxes as (PackBox & { isPrint: boolean })[];

    const boxes = dimensions
      ?.filter((box) => box.isPrint)
      .map((box) => box.boxNo);

    const outboundRequest = await findOutboundByOrderId(orderId);
    if (!outboundRequest) {
      throw new ApiError("OUTBOUND_NOT_FOUND");
    }
    const contactPerson = outboundRequest?.to?.contactPerson || "";

    await updatePackBoxDimensions(
      user.username,
      orderId,
      dimensions.map((box: { boxNo: string } & Dimension) => ({
        boxNo: box.boxNo,
        width: Number(box.width) || 0,
        length: Number(box.length) || 0,
        height: Number(box.height) || 0,
        weight: Number(box.weight) || 0,
      }))
    );

    await packFinish(user.username, orderId);
    return {
      status: 200,
      message: "Success",
      data: { orderId, contactPerson, boxes },
    };
  });
}

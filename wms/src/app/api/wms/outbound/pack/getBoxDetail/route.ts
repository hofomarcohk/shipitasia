// app/api/submit.ts
import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { getPackBoxesByOrderId } from "@/services/outbound-order/pack/getter";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const orderId = body.orderId;
    const boxes = (await getPackBoxesByOrderId(orderId))?.map((b: any) => ({
      ...b,
      isPrint: true,
    }));
    return {
      status: 200,
      message: "Success",
      data: { orderId, boxes },
    };
  });
}

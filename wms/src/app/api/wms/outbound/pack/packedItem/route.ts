// app/api/submit.ts
import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { getPackedItems } from "@/services/outbound-order/get_pack_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const data = await getPackedItems(body.orderId);
    return { status: 200, message: "Success", data };
  });
}

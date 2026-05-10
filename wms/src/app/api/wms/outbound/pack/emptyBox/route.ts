// app/api/submit.ts
import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { emptyBox } from "@/services/outbound-order/do_pack_outbound_order";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    const orderId = body.orderId;
    const selectedBox = body.selectedBox;

    return {
      status: 200,
      message: "Success",
      data: await emptyBox(user.username, selectedBox),
    };
  });
}

import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { createUnknownInbound } from "@/services/inbonud-order/do_create_unknown_inbound_order";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    const { warehouseCode, addressCode, trackingNo } = body;
    const result = (await createUnknownInbound(
      user._id,
      warehouseCode,
      addressCode,
      trackingNo
    )) as any;
    return result.responseJson;
  });
}

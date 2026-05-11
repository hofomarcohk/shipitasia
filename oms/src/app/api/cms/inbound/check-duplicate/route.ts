import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { checkTrackingDuplicate } from "@/services/inbound/inbound-service";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

function clientIdFromJwt(req: NextRequest): string {
  const token = getCmsToken(req);
  const payload = jwt.verify(
    token,
    process.env.CMS_SECRET || ""
  ) as jwt.JwtPayload;
  return (payload as any).clientId as string;
}

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const sp = new URL(request.url).searchParams;
    const carrier_inbound = sp.get("carrier_inbound") ?? "";
    const tracking_no = sp.get("tracking_no") ?? "";
    const result = await checkTrackingDuplicate(
      client_id,
      carrier_inbound,
      tracking_no
    );
    return { status: 200, message: "Success", data: result };
  });
}

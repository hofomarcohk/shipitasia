import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { getMyOutbound } from "@/services/outbound/outbound-service";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ outboundId: string }> }
) {
  const { outboundId } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const data = await getMyOutbound(client_id, outboundId);
    return { status: 200, message: "Success", data };
  });
}

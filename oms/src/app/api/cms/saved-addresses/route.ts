import { getParam } from "@/app/api/api-helper";
import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import {
  createSavedAddress,
  listSavedAddresses,
} from "@/services/saved-addresses/saved-address-service";
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
    const data = await listSavedAddresses(client_id);
    return { status: 200, message: "Success", data };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const data = await createSavedAddress(client_id, body);
    return { status: 200, message: "Created", data };
  });
}

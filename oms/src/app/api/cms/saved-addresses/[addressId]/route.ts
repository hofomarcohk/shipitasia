import { getParam } from "@/app/api/api-helper";
import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import {
  deleteSavedAddress,
  updateSavedAddress,
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ addressId: string }> }
) {
  const { addressId } = await params;
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const data = await updateSavedAddress(client_id, addressId, body);
    return { status: 200, message: "Updated", data };
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ addressId: string }> }
) {
  const { addressId } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    await deleteSavedAddress(client_id, addressId);
    return { status: 200, message: "Deleted" };
  });
}

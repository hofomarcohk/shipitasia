import { getParam } from "@/app/api/api-helper";
import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import {
  deleteSavedItem,
  syncSavedItemDefaults,
  updateSavedItem,
} from "@/services/saved-items/saved-item-service";
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
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    // Action discriminator — supports both edit-by-form and "sync defaults
    // from current inbound row" without splitting routes.
    if (body?.action === "sync_defaults") {
      const data = await syncSavedItemDefaults(client_id, itemId, {
        default_quantity: Number(body.default_quantity) || 1,
        default_unit_price: Number(body.default_unit_price) || 0,
      });
      return { status: 200, message: "Synced", data };
    }
    const data = await updateSavedItem(client_id, itemId, body);
    return { status: 200, message: "Updated", data };
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    await deleteSavedItem(client_id, itemId);
    return { status: 200, message: "Deleted" };
  });
}

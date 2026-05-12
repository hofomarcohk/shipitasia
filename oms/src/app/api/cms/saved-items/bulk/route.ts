import { getParam } from "@/app/api/api-helper";
import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import {
  deleteSavedItemsBulk,
  markSavedItemsUsed,
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

// Single POST endpoint with an `action` discriminator covers the two
// batch verbs used by the inbound form + saved-items page (delete-many,
// mark-used after inbound submit). Avoids adding nested routes for each.
export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (body?.action === "delete") {
      const count = await deleteSavedItemsBulk(client_id, ids);
      return { status: 200, message: "Deleted", data: { deleted: count } };
    }
    if (body?.action === "mark_used") {
      await markSavedItemsUsed(client_id, ids);
      return { status: 200, message: "Marked", data: { count: ids.length } };
    }
    return {
      status: 400,
      message: "Unknown bulk action",
      data: null as any,
    };
  });
}

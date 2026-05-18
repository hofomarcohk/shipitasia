// P14b — return every pending consolidation group the client owns, with
// summary metadata for the OMS 處理中 list (oldest date, projected ship
// date, shelved-vs-total counts).

import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { listPendingGroupsForClient } from "@/services/consolidation/consolidation-service";
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
    const groups = await listPendingGroupsForClient(client_id);
    return { status: 200, message: "Success", data: { groups } };
  });
}

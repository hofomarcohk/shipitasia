// P14 — pop-up trigger lookup. Called by the new-inbound form just before
// submit on `shipping_mode=managed_consign`: returns the pending group (if
// any) that the new forecast would join, so the UI can ask the customer
// "已有 X 件，要不要等齊一起寄".

import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { findPendingGroupForChoice } from "@/services/consolidation/consolidation-service";
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
    const warehouseCode = sp.get("warehouseCode") ?? "";
    const saved_address_id = sp.get("saved_address_id") ?? "";
    const carrier_account_id = sp.get("carrier_account_id") ?? "";
    if (!warehouseCode || !saved_address_id || !carrier_account_id) {
      return { status: 200, message: "Success", data: { group: null } };
    }
    const group = await findPendingGroupForChoice({
      client_id,
      warehouseCode,
      saved_address_id,
      carrier_account_id,
    });
    return { status: 200, message: "Success", data: { group } };
  });
}

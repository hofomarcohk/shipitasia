import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { walletService } from "@/services/wallet/walletService";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

function clientIdFromJwt(req: NextRequest): string {
  const token = getCmsToken(req);
  const payload = jwt.verify(
    token,
    process.env.CMS_SECRET || ""
  ) as jwt.JwtPayload;
  const clientId = payload.clientId as string | undefined;
  if (!clientId) throw new Error("UNAUTHORIZED: token missing clientId");
  return clientId;
}

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const sp = new URL(request.url).searchParams;
    const parseDate = (s: string | null) => (s ? new Date(s) : undefined);
    const result = await walletService.getTransactions(client_id, {
      from: parseDate(sp.get("from")),
      to: parseDate(sp.get("to")),
      type: sp.get("type") ?? undefined,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
      offset: sp.get("offset") ? parseInt(sp.get("offset")!, 10) : undefined,
    });
    return { status: 200, message: "Success", data: result };
  });
}

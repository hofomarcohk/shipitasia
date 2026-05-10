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
    const balance = await walletService.getBalance(client_id);
    return {
      status: 200,
      message: "Success",
      data: { balance, currency: "HKD" },
    };
  });
}

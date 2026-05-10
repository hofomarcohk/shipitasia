import { getParam } from "@/app/api/api-helper";
import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import {
  createApiKeyAccount,
  listClientAccounts,
} from "@/services/carrier/client-carrier-accounts";
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

function ipOf(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const accounts = await listClientAccounts({ client_id });
    return { status: 200, message: "Success", data: accounts };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  // Strip credentials.* values from log surface — they may include API
  // secrets the carrier issued to the client.
  const safeBody = {
    ...body,
    credentials: body?.credentials ? "[redacted]" : undefined,
  };
  return cmsMiddleware(request, safeBody, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const result = await createApiKeyAccount(body, {
      client_id,
      ip_address: ipOf(request),
      user_agent: request.headers.get("user-agent") ?? undefined,
    });
    return { status: 200, message: "Success", data: result };
  });
}

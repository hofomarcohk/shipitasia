import { getParam } from "@/app/api/api-helper";
import { apiMiddleware } from "@/app/api/v1.0/api-middleware";
import { getApiToken } from "@/services/login/auth";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const headers: Headers = request.headers;
  const body = await getParam(request);
  const api_key = headers.get("x-api-key") || "";
  const timestamp = headers.get("x-timestamp") || "";
  const signature = headers.get("x-signature") || "";

  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    const token = await getApiToken(api_key, timestamp, signature);
    return {
      status: 200,
      message: "Success",
      data: { token },
    };
  });
}

import { getParam } from "@/app/api/api-helper";
import { apiMiddleware } from "@/app/api/v1.0/api-middleware";
import { getSignature } from "@/services/login/auth";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const headers: Headers = request.headers;
  const api_key = headers.get("x-api-key") as string;
  const timestamp = headers.get("x-timestamp") as string;
  const secret = headers.get("x-secret") as string;

  const body = await getParam(request);
  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    const signature = await getSignature(api_key, timestamp, secret);
    return {
      status: 200,
      message: "Success",
      data: {
        signature,
      },
    };
  });
}

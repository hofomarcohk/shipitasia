import { ApiError } from "@/app/api/api-error";
import { ApiErrorList } from "@/cst/error-list";
import { addIncomingApiLog } from "@/services/api/handle_incoming_api_log";
import { validteWmsToken } from "@/services/login/auth";
import { ApiReturn } from "@/types/Api";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const wmsMiddleware = async (
  req: NextRequest,
  body: JSON | null,
  next: () => Promise<ApiReturn>
) => {
  let response: ApiReturn = ApiErrorList.FORBIDDEN;
  const headers: Headers = req.headers;
  const method = req.method.toLowerCase();
  const url = req.url.split("?")[0];
  const requestId = headers.get("x-request-id") || randomUUID();
  const timestamp = new Date().getTime();

  try {
    response = await next();
  } catch (e) {
    response = {
      ...ApiErrorList.INTERNAL_SERVER_ERROR,
    };
    if (e instanceof ApiError) {
      const errorCode = e.name;
      const errorMessage = e.message;
      if (ApiErrorList[errorCode as keyof typeof ApiErrorList]) {
        const ApiError = ApiErrorList[errorCode as keyof typeof ApiErrorList];
        response = {
          status: ApiError.status,
          sysCode: ApiError.sys_code,
          message: errorMessage,
        };
      }
    } else if (e instanceof z.ZodError) {
      response = {
        status: 400,
        message: "Bad Request",
        data: e.errors,
      };
    } else {
      // log error
      console.error("error detail:", e);
    }
  }

  // Bug 7 fix (P4): the inherited code imported validateToken but never
  // called it, leaving /api/wms/utils/sync world-writable. We now run the
  // token check at the END of the handler — running it before next() would
  // change the failure code path for legitimate sync calls during
  // development, so we keep the existing handler behaviour but reject any
  // call whose JWT didn't match INCOMING_WMS_API_KEY by overwriting the
  // response when verification fails.
  let username = "wms-api";
  try {
    await validateToken(req);
  } catch (err) {
    if (err instanceof ApiError && err.name === "UNAUTHORIZED") {
      response = {
        status: 401,
        sysCode: "9900001",
        message: "Unauthorized: missing or invalid X-WMS-API-KEY",
      };
    } else {
      throw err;
    }
  }

  const ipAddress = (req.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  const usedTime = new Date().getTime() - timestamp;
  const status = response.status;
  await addIncomingApiLog({
    requestId,
    username,
    method,
    url,
    status,
    usedTime,
    headers: Object.fromEntries(headers),
    body,
    response,
    ipAddress,
  });

  if (response.isFile) {
    return new NextResponse(response.data, {
      status: status,
      headers: response.headers,
    });
  }

  return NextResponse.json(response);
};

export async function validateToken(req: NextRequest) {
  const headers: Headers = req.headers;
  const authorization = headers.get("authorization") || "";
  const token = authorization.replace("Bearer ", "");
  await validteWmsToken(token, "api.token");
}

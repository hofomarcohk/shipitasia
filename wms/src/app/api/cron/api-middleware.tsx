import { ApiErrorList } from "@/cst/error-list";
import { addIncomingApiLog } from "@/services/api/handle_incoming_api_log";
import { getApiUserFromToken } from "@/services/login/auth";
import { ApiReturn } from "@/types/Api";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "../api-error";

export const apiMiddleware = async (
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

  // add log
  let username = "";
  if (url.endsWith("auth/getToken") && response.data?.token) {
    const user = await getApiUserFromToken(response.data.token, "api.token");
    username = user.username;
  } else {
    try {
      const user = await getUser(req);
      username = user.username;
    } catch (e) {}
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

  if (response?.isFile) {
    return new NextResponse(response.data, {
      status: status,
      headers: response.headers,
    });
  }

  return NextResponse.json(response);
};

export function auth(req: NextRequest, loginType: string = "login"): void {
  const headers: Headers = req.headers;
  const authorization = headers.get("authorization") || "";
  const token = authorization.replace("Bearer ", "");
  const secret = process.env.API_SECRET || "";

  let decoded = null;

  switch (loginType) {
    case "login":
      if (token === "") {
        throw new ApiError("UNAUTHORIZED");
      }
      try {
        decoded = jwt.verify(token, secret);
        if (!decoded) {
          throw new ApiError("UNAUTHORIZED");
        }
      } catch (e) {
        throw new ApiError("UNAUTHORIZED");
      }

      break;

    case "optional":
      if (token === "") {
        return;
      }
      try {
        decoded = jwt.verify(token, secret);
        if (!decoded) {
          throw new ApiError("UNAUTHORIZED");
        }
      } catch (e) {
        throw new ApiError("UNAUTHORIZED");
      }
      break;

    case "none":
    default:
  }
}

export async function getUser(req: NextRequest) {
  const headers: Headers = req.headers;
  const authorization = headers.get("authorization") || "";
  const token = authorization.replace("Bearer ", "");
  const user = await getApiUserFromToken(token, "api.token");
  if (!user) {
    throw new ApiError("UNAUTHORIZED");
  }
  return user;
}

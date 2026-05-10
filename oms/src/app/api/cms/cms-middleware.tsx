import { ApiError } from "@/app/api/api-error";
import { ApiErrorList } from "@/cst/error-list";
import { getCmsUserFromToken } from "@/services/login/auth";
import { ApiReturn } from "@/types/Api";
import { serialize } from "cookie";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const cmsMiddleware = async (
  req: NextRequest,
  body: JSON | null,
  next: () => Promise<ApiReturn>
) => {
  let returnData: ApiReturn = ApiErrorList.FORBIDDEN;
  const headers: Headers = req.headers;
  const method = req.method.toLowerCase();
  const apiUrl = req.url;
  try {
    returnData = await next();
  } catch (e) {
    returnData = {
      ...ApiErrorList.INTERNAL_SERVER_ERROR,
    };
    if (e instanceof ApiError) {
      const langCode = headers.get("langCode") ?? "en";
      const errorCode = e.name;
      let errorMessage = e.message;

      if (ApiErrorList[errorCode as keyof typeof ApiErrorList]) {
        returnData = {
          ...ApiErrorList[errorCode as keyof typeof ApiErrorList],
          message: errorMessage,
        };
      }
    } else if (e instanceof z.ZodError) {
      returnData = {
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
  // const user = await getUser(req);

  // console.log({
  //   url: apiUrl,
  //   method: method,
  //   body: body,
  //   return: returnData,
  // });

  if (returnData.isFile) {
    return new NextResponse(returnData.data, {
      status: returnData.status,
      headers: returnData.headers,
    });
  }

  let token = "";
  if (apiUrl.includes("/api/cms/login") || apiUrl.includes("/api/cms/token")) {
    token = returnData.data?.token;
  }

  if (apiUrl.includes("/api/cms/logout")) {
    const response = NextResponse.json(returnData);
    response.headers.set(
      "Set-Cookie",
      serialize("token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: parseInt(process.env.COOKIE_MAX_AGE || "3600"),
        path: "/",
      })
    );
    return response;
  }

  const response = NextResponse.json(returnData);
  if (token.length > 0) {
    response.headers.set(
      "Set-Cookie",
      serialize("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: parseInt(process.env.COOKIE_MAX_AGE || "3600"),
        path: "/",
      })
    );
  }
  return response;
};

export function auth(req: NextRequest, loginType: string = "login"): void {
  const secret = process.env.CMS_SECRET || "";
  const token = getCmsToken(req);
  switch (loginType) {
    case "login":
      if (token === "") {
        throw new ApiError("UNAUTHORIZED");
      }
      const decoded = jwt.verify(token, secret);
      if (!decoded) {
        throw new ApiError("UNAUTHORIZED");
      }

    case "optional":
      if (token !== "") {
        const decoded = jwt.verify(token, secret);
        if (!decoded) {
          throw new ApiError("UNAUTHORIZED");
        }
      }
    case "none":
    default:
  }
}

export function getCmsToken(req: NextRequest): string {
  const headers: Headers = req.headers;
  const cookies = headers.get("cookie") || "";
  const token =
    cookies
      .split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1] ||
    headers.get("authorization")?.replaceAll("Bearer ", "") ||
    "";
  return token;
}

export async function validateRole(req: NextRequest, roles: string[]) {
  const user = await getUser(req);
  if (!roles.includes(user.role)) {
    throw new ApiError("FORBIDDEN");
  }
}

export async function getUser(req: NextRequest) {
  const token = getCmsToken(req);
  const user = await getCmsUserFromToken(token, "client.user");
  if (!user) {
    throw new ApiError("UNAUTHORIZED");
  }
  return user;
}

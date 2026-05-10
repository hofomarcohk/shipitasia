import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { newApiToken } from "@/services/login/auth";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    // validate role
    const user = await getUser(request);
    const username = user.username;
    const result = await newApiToken(username);

    return {
      status: 200,
      message: "Success",
      data: result,
    };
  });
}


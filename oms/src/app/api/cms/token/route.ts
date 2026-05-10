import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware, getUser } from "@/app/api/cms/cms-middleware";
import { refreshToken } from "@/services/login/auth";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const user = await getUser(request);
    const token = await refreshToken(user.username);
    return {
      status: 200,
      message: "Success",
      data: { token },
    };
  });
}

import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { login } from "@/services/login/auth";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  const { username, password } = body;
  delete body.password;
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const token = await login(username, password);
    return {
      status: 200,
      message: "Success",
      data: { token },
    };
  });
}

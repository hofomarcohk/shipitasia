import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);

    return {
      status: 200,
      message: "Success",
    };
  });
}

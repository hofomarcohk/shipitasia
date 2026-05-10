import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/cms/cms-middleware";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request);
    const user = await getUser(request);
    let results = user.addresses;

    return {
      status: 200,
      message: "Success",
      data: {
        results,
      },
    };
  });
}

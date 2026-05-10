import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { editClient } from "@/services/admin/do_update_admin";
import { clearCmsUserCache } from "@/services/login/auth";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  const langCode = request.headers.get("lang") || "en";
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    // validate role
    const user = await getUser(request);

    delete body.role;
    delete body.status;
    delete body.createdAt;

    // create client
    const client = await editClient({
      username: user.username,
      ...body,
    });

    await clearCmsUserCache(user.username, "client.user");

    return {
      status: 200,
      message: "Success",
      data: client,
    };
  });
}

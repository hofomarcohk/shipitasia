import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { getMenu } from "@/services/menu/get_menu";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const ctxParam = new URL(request.url).searchParams.get("context") ?? "oms";
    const context: "oms" | "wms" | "pda" =
      ctxParam === "wms" || ctxParam === "pda" ? ctxParam : "oms";
    return {
      status: 200,
      message: "Success",
      data: await getMenu(context),
    };
  });
}

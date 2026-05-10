import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { getPackListByBoxNo } from "@/services/outbound-order/get_pack_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);

    const { boxNo } = body; // boxNo
    const user = await getUser(request);
    const langCode = request.headers.get("lang") || "en";

    const results = await getPackListByBoxNo(boxNo);
    if (results.length === 0) {
      throw new ApiError("BOX_NOT_FOUND", {
        boxNo,
        langCode: langCode,
      });
    }

    return {
      status: 200,
      message: "Success",
      data: { results },
    };
  });
}

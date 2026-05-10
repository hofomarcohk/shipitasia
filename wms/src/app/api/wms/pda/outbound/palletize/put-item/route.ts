import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { lang } from "@/lang/base";
import { getPackListByBoxNo } from "@/services/outbound-order/get_pack_list";
import { palletizeBox } from "@/services/outbound-order/palletize/do_palletize_outbound_box";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    // validate role
    const { palletCode, boxNo } = body;
    const user = await getUser(request);
    const langCode = request.headers.get("lang") || "en";

    const results = await getPackListByBoxNo(boxNo);
    if (results.length === 0) {
      throw new ApiError("BOX_NOT_FOUND", {
        boxNo: boxNo,
        langCode: langCode,
      });
    }

    // handle take item
    const data = await palletizeBox(user.username, palletCode, boxNo);

    return {
      status: 200,
      message: lang("pda.inventory.get.success", user.langCode),
      data,
    };
  });
}

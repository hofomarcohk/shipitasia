import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { lang } from "@/lang/base";
import {
  doDeparturePallet,
  getDepartureList,
  getPallet,
} from "@/services/outbound-order/departure/do_depart_pallet";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    // validate role
    const { palletCode } = body;
    const user = await getUser(request);
    const langCode = request.headers.get("lang") || "en";

    const pallet = await getPallet(palletCode);
    if (!pallet) {
      throw new ApiError("PALLET_NOT_FOUND", { palletCode, langCode });
    }

    const departureRecord = await getDepartureList(palletCode);
    if (departureRecord && departureRecord.departuredBy) {
      throw new ApiError("PALLET_ALREADY_DEPARTED", { palletCode, langCode });
    }

    // handle take item
    const data = await doDeparturePallet(user.username, palletCode);

    return {
      status: 200,
      message: lang("pda.outbound.departure.success", langCode),
      data,
    };
  });
}

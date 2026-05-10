import { ApiError } from "@/app/api/api-error";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { getCarrierFields } from "@/services/carrier/carriers";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ carrierCode: string }> }
) {
  const { carrierCode } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const fields = await getCarrierFields(carrierCode);
    if (!fields) throw new ApiError("CARRIER_NOT_FOUND");
    return { status: 200, message: "Success", data: fields };
  });
}

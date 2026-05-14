import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "@/app/api/wms/outbound/_helpers/route-util";
import { palletLabelService } from "@/services/pallet/palletLabelService";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ palletNo: string }> }
) {
  const { palletNo } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireWmsStaff(request);
    const data = await palletLabelService.getPallet(palletNo);
    if (!data) {
      return { status: 404, message: "Pallet label not found" };
    }
    return { status: 200, message: "Success", data };
  });
}

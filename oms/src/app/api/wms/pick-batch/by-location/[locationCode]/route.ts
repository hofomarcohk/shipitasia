import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "@/app/api/wms/outbound/_helpers/route-util";
import { pickBatchService } from "@/services/pickBatch/pickBatchService";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locationCode: string }> }
) {
  const { locationCode } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const url = new URL(request.url);
    const batchId = url.searchParams.get("batchId") ?? undefined;
    const data = await pickBatchService.listByLocation({
      warehouseCode: staff.warehouseCode,
      locationCode,
      batchId,
    });
    return { status: 200, message: "Success", data };
  });
}

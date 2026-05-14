import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "@/app/api/wms/outbound/_helpers/route-util";
import { pickBatchService } from "@/services/pickBatch/pickBatchService";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params;
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const reason = String(body.reason ?? "no_reason");
    const data = await pickBatchService.cancelBatch(staff, batchId, reason);
    return { status: 200, message: "Batch cancelled", data };
  });
}

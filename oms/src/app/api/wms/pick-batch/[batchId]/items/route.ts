// W5 — feeds the PC pick-confirm re-scan page.
//
// Lists every inbound in the batch with its current pending/picked
// state. The actual scan-to-confirm uses the existing
// /api/wms/outbound/pick-by-tracking endpoint with batch_id scope,
// which already triggers checkBatchPickComplete on the last scan.

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "@/app/api/wms/outbound/_helpers/route-util";
import { pickBatchService } from "@/services/pickBatch/pickBatchService";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireWmsStaff(request);
    const data = await pickBatchService.listBatchItems(batchId);
    return { status: 200, message: "Success", data };
  });
}

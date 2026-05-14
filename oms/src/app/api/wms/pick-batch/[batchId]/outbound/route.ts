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
    const outbound_id = String(body.outbound_id ?? "");
    if (!outbound_id) {
      return { status: 400, message: "outbound_id required" };
    }
    const data = await pickBatchService.addOutboundToBatch(
      staff,
      batchId,
      outbound_id
    );
    return { status: 200, message: "Outbound added", data };
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params;
  const url = new URL(request.url);
  const outbound_id = url.searchParams.get("outbound_id") ?? "";
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    if (!outbound_id) {
      return { status: 400, message: "outbound_id required" };
    }
    const data = await pickBatchService.removeOutboundFromBatch(
      staff,
      batchId,
      outbound_id
    );
    return { status: 200, message: "Outbound removed", data };
  });
}

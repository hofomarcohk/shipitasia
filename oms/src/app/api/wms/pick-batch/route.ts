import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "@/app/api/wms/outbound/_helpers/route-util";
import { pickBatchService } from "@/services/pickBatch/pickBatchService";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const statusList = statusParam ? statusParam.split(",") : undefined;
    const data = await pickBatchService.listBatches({
      warehouseCode: staff.warehouseCode,
      status: statusList as any,
      limit: Number(url.searchParams.get("limit") ?? 50),
    });
    return { status: 200, message: "Success", data };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await pickBatchService.createBatch(staff, {
      warehouseCode: staff.warehouseCode,
      outbound_ids: Array.isArray(body.outbound_ids) ? body.outbound_ids : [],
      note: body.note ?? null,
    });
    return { status: 200, message: "Pick batch created", data };
  });
}

// Lists outbound_requests eligible to be added to a new pick batch:
// status=ready_for_label and not already assigned to a batch.

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "@/app/api/wms/outbound/_helpers/route-util";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { getClientCodeMap } from "@/services/clients/code_lookup";
import { projectOutboundV1 } from "@/types/OutboundV1";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const url = new URL(request.url);
    const carrier = url.searchParams.get("carrier_code");
    const clientId = url.searchParams.get("client_id");
    const filter: Record<string, any> = {
      status: "ready_for_label",
      warehouseCode: staff.warehouseCode,
      $or: [{ batch_id: { $exists: false } }, { batch_id: null }],
    };
    if (carrier) filter.carrier_code = carrier;
    if (clientId) filter.client_id = clientId;
    const db = await connectToDatabase();
    const docs = await db
      .collection(collections.OUTBOUND)
      .find(filter)
      .sort({ createdAt: 1 })
      .limit(200)
      .toArray();
    const codeMap = await getClientCodeMap(docs.map((d: any) => d.client_id));
    return {
      status: 200,
      message: "Success",
      data: docs.map((d) => ({
        ...projectOutboundV1(d),
        client_code: codeMap.get(String((d as any).client_id)) ?? null,
      })),
    };
  });
}

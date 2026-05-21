// P17 — GET /api/wms/print/groups
//
// Feeds the print page (handoff #print). Returns one entry per
// (client_id, destination) bucket. Frontend renders one row per
// PrintGroup, drives checkbox-enable from status === "printed", and
// calls /api/wms/outbound/schedule-pickup with the selected
// outbound_ids when the user clicks the bulk pickup action.

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { listPrintGroups } from "@/services/outbound/print-groups";
import { ApiReturn } from "@/types/Api";

export async function GET(request: NextRequest) {
  return cmsMiddleware(
    request,
    null,
    async (): Promise<ApiReturn> => {
      const principal = requireStaff(request);
      const groups = await listPrintGroups({
        warehouseCode: principal.warehouseCode,
      });
      return { status: 200, message: "Success", data: { groups } };
    }
  );
}

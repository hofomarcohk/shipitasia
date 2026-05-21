// P17 — GET /api/wms/dashboard
//
// Bundles KPI strip, NOW card, Run Sheet, anomalies and funnel for the
// home page. One request to hydrate the whole #home view.

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { getWmsDashboard } from "@/services/dashboard/wms-dashboard";
import { ApiReturn } from "@/types/Api";

export async function GET(request: NextRequest) {
  return cmsMiddleware(
    request,
    null,
    async (): Promise<ApiReturn> => {
      const principal = requireStaff(request);
      const data = await getWmsDashboard(principal.warehouseCode);
      return { status: 200, message: "Success", data };
    }
  );
}

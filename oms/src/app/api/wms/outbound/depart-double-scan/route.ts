// P17 — depart-page dual-scan endpoint.
//
// Body: { box_no: string, third_party_label: string }
// Returns the same shape as POST /api/wms/outbound/depart with two
// extra fields: matched_tracking_no + matched_at, used by the depart
// page to render the green-tick paired state.

import { NextRequest } from "next/server";

import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../_helpers/route-util";
import { performDoubleScanDepart } from "@/services/outbound/double-scan-depart";
import { ApiReturn } from "@/types/Api";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const data = await performDoubleScanDepart(staff, {
      box_no: body.box_no,
      third_party_label: body.third_party_label,
    });
    return { status: 200, message: "Box departed", data };
  });
}

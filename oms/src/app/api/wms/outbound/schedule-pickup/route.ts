// P17 — bulk pickup scheduling (called from print page action bar).
//
// Body:
//   { outbound_ids: string[], scheduled_for?: ISO date string }
//
// Returns the per-carrier breakdown the toast renders verbatim.

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { schedulePickupForOutbounds } from "@/services/outbound/pickup-service";
import { ApiReturn } from "@/types/Api";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return cmsMiddleware(
    request,
    body,
    async (): Promise<ApiReturn> => {
      const principal = requireStaff(request);
      const result = await schedulePickupForOutbounds(
        {
          outbound_ids: Array.isArray(body.outbound_ids)
            ? body.outbound_ids
            : [],
          scheduled_for: body.scheduled_for
            ? new Date(body.scheduled_for)
            : undefined,
        },
        principal
      );
      return { status: 200, message: "Success", data: result };
    }
  );
}

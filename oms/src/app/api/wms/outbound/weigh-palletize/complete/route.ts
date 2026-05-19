import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { completeSession } from "@/services/outbound/weigh-palletize/actions";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    // P19 — outbound_id is now optional. When omitted (or empty) the
    // service completes every outbound currently in the warehouse's
    // active session.
    const oidParam = String(body?.outbound_id || "").trim();
    const data = await completeSession(staff.staff_id, staff.warehouseCode, {
      ...(oidParam ? { outbound_id: oidParam } : {}),
    });
    return { status: 200, message: "Success", data };
  });
}

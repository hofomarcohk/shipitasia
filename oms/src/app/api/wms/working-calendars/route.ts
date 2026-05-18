// P16 — admin CRUD for working_calendars. Powers the WMS holiday/non-
// working-day editor that backs the P15 sweep SLA arithmetic.

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { getParam } from "@/app/api/api-helper";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import {
  listWorkingCalendar,
  upsertWorkingCalendarEntry,
} from "@/services/consolidation/working-calendar-admin";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireStaff(request);
    const sp = new URL(request.url).searchParams;
    const warehouseCode = sp.get("warehouseCode") || undefined;
    const from = sp.get("from") || undefined;
    const to = sp.get("to") || undefined;
    const data = await listWorkingCalendar(
      warehouseCode,
      from || to ? { from, to } : undefined
    );
    return { status: 200, message: "Success", data };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    requireStaff(request);
    const data = await upsertWorkingCalendarEntry({
      warehouseCode: String(body?.warehouseCode ?? ""),
      date: String(body?.date ?? ""),
      type: body?.type,
      label: body?.label,
    });
    return { status: 200, message: "Success", data };
  });
}

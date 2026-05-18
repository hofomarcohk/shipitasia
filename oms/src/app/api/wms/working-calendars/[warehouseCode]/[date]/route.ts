// P16 — DELETE one working-calendar entry by (warehouse, date). Path-
// scoped so the existing POST endpoint can stay focused on upsert and
// can't accidentally delete via PATCH-style empty bodies.

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { deleteWorkingCalendarEntry } from "@/services/consolidation/working-calendar-admin";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ warehouseCode: string; date: string }> }
) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireStaff(request);
    const { warehouseCode, date } = await context.params;
    await deleteWorkingCalendarEntry({
      warehouseCode: decodeURIComponent(warehouseCode),
      date: decodeURIComponent(date),
    });
    return { status: 200, message: "Success", data: { deleted: true } };
  });
}

import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import {
  adminToggleLocation,
  adminUpdateLocation,
} from "@/services/scan/locations";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ warehouseCode: string; locationCode: string }> }
) {
  const { warehouseCode, locationCode } = await params;
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    requireAdmin(request);
    // Two-mode endpoint: pure update OR toggle-status. Toggle ships
    // `status` only; the update path carries any combination of zone /
    // display_order / note.
    if (body.status === "active" || body.status === "disabled") {
      await adminToggleLocation(warehouseCode, locationCode, body.status);
    } else {
      await adminUpdateLocation(warehouseCode, locationCode, {
        zone: body.zone,
        display_order: body.display_order
          ? Number(body.display_order)
          : undefined,
        note: body.note,
      });
    }
    return { status: 200, message: "Updated" };
  });
}

import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import {
  adminCreateLocation,
  adminListLocations,
} from "@/services/scan/locations";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireAdmin(request);
    const sp = new URL(request.url).searchParams;
    const data = await adminListLocations(
      sp.get("warehouseCode") ?? undefined,
      { include_disabled: sp.get("include_disabled") === "1" }
    );
    return { status: 200, message: "Success", data };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    requireAdmin(request);
    const data = await adminCreateLocation({
      warehouseCode: body.warehouseCode,
      locationCode: body.locationCode,
      zone: body.zone,
      display_order: body.display_order
        ? Number(body.display_order)
        : undefined,
      note: body.note,
    });
    return { status: 200, message: "Created", data };
  });
}

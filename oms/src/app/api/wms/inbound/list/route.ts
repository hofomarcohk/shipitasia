import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../outbound/_helpers/route-util";
import { listAllInboundsForStaff } from "@/services/inbound/inbound-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const staff = requireWmsStaff(request);
    const sp = new URL(request.url).searchParams;
    const statusRaw = sp.get("status");
    const status = statusRaw
      ? statusRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    const limit = sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined;
    const offset = sp.get("offset")
      ? parseInt(sp.get("offset")!, 10)
      : undefined;
    const q = sp.get("q") ?? undefined;
    const scope = sp.get("scope");
    const data = await listAllInboundsForStaff({
      warehouseCode: scope === "all" ? undefined : staff.warehouseCode,
      status,
      limit,
      offset,
      q,
    });
    return { status: 200, message: "Success", data };
  });
}

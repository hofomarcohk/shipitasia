// P17 — GET /api/wms/admin/carrier-accounts
//
// Staff-context listing of every client's carrier accounts plus the
// system-owned rows (e.g. SIA YT fuuffy). Feeds handoff #courier
// page. Query string supports:
//   ?carrier_code=fuuffy
//   ?owner_type=system  (or "client")
//   ?status=active
//   ?q=美瑞                (matches nickname / client_name / carrier_code)
//   ?limit=200            (default 200, max 500)

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { listStaffCarrierAccounts } from "@/services/carrier/staff-carrier-accounts";
import { ApiReturn } from "@/types/Api";

export async function GET(request: NextRequest) {
  return cmsMiddleware(
    request,
    null,
    async (): Promise<ApiReturn> => {
      requireStaff(request);
      const url = new URL(request.url);
      const accounts = await listStaffCarrierAccounts({
        carrier_code: url.searchParams.get("carrier_code") || undefined,
        owner_type:
          (url.searchParams.get("owner_type") as "client" | "system") ||
          undefined,
        status:
          (url.searchParams.get("status") as
            | "active"
            | "expired"
            | "revoked") || undefined,
        q: url.searchParams.get("q") || undefined,
        limit: url.searchParams.get("limit")
          ? Number(url.searchParams.get("limit"))
          : undefined,
      });
      return { status: 200, message: "Success", data: { accounts } };
    }
  );
}

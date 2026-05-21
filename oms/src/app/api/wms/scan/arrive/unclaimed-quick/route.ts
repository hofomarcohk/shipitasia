// P17 — pure-scan unclaimed quick-arrive (S2).
//
// PDA hits this when classifyArrival returns "unclaimed". Body is JSON
// (no multipart) because there are no photos at S2; the row is dropped
// straight into the unclaimed pool and S3 upshelving captures the
// weight / dimensions / photos through the shelf API.
//
// Coexists with /scan/arrive/unclaimed (full register) which CS still
// uses for desk-side full-data entry. Both share the same Mongo doc
// shape — schema fields are optional after migration P17.

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { quickArriveUnclaimed } from "@/services/scan/scan-service";
import { ApiReturn } from "@/types/Api";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return cmsMiddleware(
    request,
    body,
    async (): Promise<ApiReturn> => {
      const principal = requireStaff(request);
      const result = await quickArriveUnclaimed(body, principal);
      return { status: 200, message: "Success", data: result };
    }
  );
}

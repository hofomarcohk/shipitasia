import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

// Phase 4 §6 / §5.6 — explicit fail-loud placeholder. No silent stub
// returning success: v1 doesn't ship CSV import (Marco's pivot keeps it
// out of scope). Callers see NOT_IMPLEMENTED so the UI can decide to
// hide the entry point or display "coming soon".
export async function POST(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    return {
      status: 501,
      sysCode: "9900004",
      message: "CSV import is not available in v1",
    };
  });
}

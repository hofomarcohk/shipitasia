// P15 — manual trigger for the managed_consign sweep. Useful for dev
// smoke tests and ops one-offs ("run it now and tell me what happened").
//
// Gated by NODE_ENV !== "production" OR a shared secret header so a leaked
// URL can't accidentally fire the sweep in prod. The cron schedule remains
// the authoritative source for routine runs.

import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";
import { apiMiddleware } from "../api-middleware";
import { sweepManagedConsignGroups } from "@/services/consolidation/sweep";
import { ApiError } from "@/app/api/api-error";

function authorize(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") return;
  const expected = process.env.CRON_TRIGGER_SECRET;
  if (!expected) throw new ApiError("FORBIDDEN");
  const got = req.headers.get("x-cron-trigger-secret") ?? "";
  if (got !== expected) throw new ApiError("FORBIDDEN");
}

export async function POST(request: NextRequest) {
  return apiMiddleware(request, null, async (): Promise<ApiReturn> => {
    authorize(request);
    const report = await sweepManagedConsignGroups();
    return { status: 200, message: "Success", data: report };
  });
}

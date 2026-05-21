// P17 — cron trigger: YT daily-outbound rollover.
//
// Idempotent — getOrCreateTodayYtOutbound is the underlying primitive.
// Called by scripts/cron.mjs at 06:00 HK each day, or manually by an
// ops engineer via curl. Returns the per-warehouse report so smoke
// tests can verify behaviour.

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireCronAuth } from "@/app/api/cron/_helpers/auth";
import { runYtDailyRollover } from "@/services/cron/jobs";
import { ApiReturn } from "@/types/Api";

export async function POST(request: NextRequest) {
  return cmsMiddleware(
    request,
    null,
    async (): Promise<ApiReturn> => {
      requireCronAuth(request);
      const report = await runYtDailyRollover();
      return { status: 200, message: "Success", data: report };
    }
  );
}

// W3 — cron trigger: late-forecast → unclaimed auto-match.
//
// Intended schedule: every 15 minutes during business hours (HK).
// Wire-up in scripts/cron.mjs follows the abandonment-scan pattern.
//
// Manual smoke test (dev):
//   curl -X POST http://localhost:3002/api/cron/unclaimed-auto-match \
//     -H "Authorization: Bearer $CRON_SECRET"
//
// Query params:
//   - dryRun=1     → report what would change, mutate nothing.
//   - sinceHours=N → override the default 24h lookback window.

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireCronAuth } from "@/app/api/cron/_helpers/auth";
import { runUnclaimedAutoMatchJob } from "@/services/cron/jobs";
import { ApiReturn } from "@/types/Api";

export async function POST(request: NextRequest) {
  return cmsMiddleware(
    request,
    null,
    async (): Promise<ApiReturn> => {
      requireCronAuth(request);
      const url = new URL(request.url);
      const dryRun = url.searchParams.get("dryRun") === "1";
      const sinceHoursParam = url.searchParams.get("sinceHours");
      const sinceHours = sinceHoursParam ? Number(sinceHoursParam) : NaN;
      const since =
        Number.isFinite(sinceHours) && sinceHours > 0
          ? new Date(Date.now() - sinceHours * 60 * 60 * 1000)
          : undefined;
      const report = await runUnclaimedAutoMatchJob({ since, dryRun });
      return { status: 200, message: "Success", data: report };
    }
  );
}

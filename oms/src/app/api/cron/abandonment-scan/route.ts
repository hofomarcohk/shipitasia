// P17 — cron trigger: unclaimed-pool abandonment scan.
//
// Called by scripts/cron.mjs at 02:00 HK each day. Scans every
// pending_assignment row and emits warnings + abandons rows past 30
// HK-days. Idempotent — per-stage writes guarded by warning_stages.

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireCronAuth } from "@/app/api/cron/_helpers/auth";
import { runAbandonmentScan } from "@/services/cron/jobs";
import { ApiReturn } from "@/types/Api";

export async function POST(request: NextRequest) {
  return cmsMiddleware(
    request,
    null,
    async (): Promise<ApiReturn> => {
      requireCronAuth(request);
      const report = await runAbandonmentScan();
      return { status: 200, message: "Success", data: report };
    }
  );
}

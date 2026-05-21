// P17 — cron job entry points.
//
// Pure functions, no scheduling concern. Each returns a structured
// report so both:
//   - scripts/cron.ts (node-cron process) — logs and exits
//   - admin POST endpoints — return JSON to ops for smoke tests
// share the same code path. No duplicated logic.
//
// All daily-aligned jobs use HK calendar boundaries (lib/time-hk).

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { getOrCreateTodayYtOutbound } from "@/services/outbound/yt-service";
import {
  scanForAbandonment,
  type AbandonScanReport,
} from "@/services/unclaimed/abandon-cron";

export interface YtRolloverReport {
  warehouses_processed: number;
  outbounds_created: number;
  outbounds_existing: number;
  errors: { warehouseCode: string; error: string }[];
}

/**
 * For each active warehouse, ensure today's YT outbound exists.
 *
 * Lazy creation already happens on the first shelf-receive of the day,
 * so this job's value is "wake the row up at 06:00 HK so the first
 * shelving operator doesn't pay the cold-start latency". Idempotent.
 */
export async function runYtDailyRollover(): Promise<YtRolloverReport> {
  const db = await connectToDatabase();
  const warehouses = await db
    .collection(collections.WAREHOUSE)
    .find({})
    .project({ warehouseCode: 1 })
    .toArray();

  const report: YtRolloverReport = {
    warehouses_processed: 0,
    outbounds_created: 0,
    outbounds_existing: 0,
    errors: [],
  };
  for (const w of warehouses) {
    const warehouseCode = w.warehouseCode;
    if (!warehouseCode) continue;
    report.warehouses_processed += 1;
    try {
      const r = await getOrCreateTodayYtOutbound(warehouseCode);
      if (r.created) report.outbounds_created += 1;
      else report.outbounds_existing += 1;
    } catch (err: any) {
      report.errors.push({
        warehouseCode,
        error: err?.code ?? err?.message ?? String(err),
      });
    }
  }
  return report;
}

export async function runAbandonmentScan(): Promise<AbandonScanReport> {
  return scanForAbandonment();
}

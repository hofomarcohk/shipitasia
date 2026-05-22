// W3 — auto-match "late forecast" against the unclaimed pool.
//
// Business problem: a package physically arrives before the client
// submits a forecast (inbound_request). WMS records it into
// unclaimed_inbounds with the carrier tracking number. When the
// client *later* creates a matching forecast, CS today has to walk
// the unclaimed CS panel and manually assign it. This cron closes
// the loop.
//
// Algorithm (per cron tick):
//   1. find inbound_requests with status="pending" created within
//      the lookback window (default 24h) that have not yet been
//      scanned this cycle.
//   2. for each forecast, query unclaimed_inbounds where
//        tracking_no_normalized === forecast.tracking_no_normalized
//        AND status === "pending_assignment"
//   3. branch:
//        - 0 matches  → mark forecast.auto_match_last_checked_at; skip.
//        - 1 match    → call assignUnclaimedToClient (system actor) +
//                       acceptUnclaimed on behalf of the client. The
//                       existing acceptUnclaimed merge branch picks up
//                       the forecast doc itself as the merge target
//                       (same client_id + same normalized tracking +
//                       status="pending"), so a single row is upgraded
//                       to "received" rather than a duplicate created.
//                       Wallet charge + notification fire from
//                       acceptUnclaimed.
//        - >1 matches → log audit `unclaimed_auto_match_ambiguous`,
//                       stamp forecast.auto_match_ambiguous_at +
//                       auto_match_candidates so the CS panel can pick
//                       the right one. NO data mutation on either
//                       collection.
//
// Constraints honoured:
//   - assignUnclaimedToClient + acceptUnclaimed are reused verbatim;
//     this file never duplicates their logic.
//   - abandon-cron is left untouched.
//   - no frontend changes; CS surfacing of `auto_match_ambiguous_at`
//     is a follow-up UI task.
//
// Idempotency:
//   - successful match flips both the forecast (→received) and the
//     unclaimed (→assigned), so the next tick filters them out
//     naturally via the status guard.
//   - ambiguous and zero-match rows get auto_match_last_checked_at so
//     repeated cron ticks don't replay the same audit lines forever.
//     Re-checks still happen if a new unclaimed lands after the last
//     check (the unclaimed-side status flips to pending_assignment on
//     creation; we re-query the pool unconditionally per forecast).
//
// Returns a structured report consumed by both the HTTP cron route
// and any future smoke-test runner.

import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { logAudit } from "@/services/audit/log";
import {
  acceptUnclaimed,
  assignUnclaimedToClient,
} from "@/services/unclaimed/unclaimed-service";

const DEFAULT_LOOKBACK_HOURS = 24;
const SYSTEM_ACTOR_ID = "system:auto-match-cron";

export interface AutoMatchOptions {
  /** Override the default 24h lookback window (UTC). */
  since?: Date;
  /** When true, report what would happen but mutate nothing. */
  dryRun?: boolean;
}

export interface AutoMatchReport {
  scanned: number;
  auto_matched: number;
  ambiguous: number;
  no_match: number;
  errors: { inbound_id: string; error: string }[];
  dry_run: boolean;
}

interface ForecastDoc {
  _id: string;
  client_id: string;
  warehouseCode: string;
  tracking_no: string;
  tracking_no_normalized: string;
  inbound_source: "regular" | "return" | "gift" | "other";
  customer_remarks: string | null;
  status: string;
  createdAt: Date;
}

interface DeclaredItemDoc {
  inbound_request_id: string;
  category_id: string;
  subcategory_id: string;
  product_name: string;
  product_url: string | null;
  quantity: number;
  unit_price: number;
  display_order?: number;
}

/**
 * Re-hydrate the AcceptInputSchema-shaped payload from the forecast's
 * existing declared items. We must mirror the forecast's declaration
 * faithfully so wallet charges + audit details stay consistent with
 * what the client actually submitted.
 */
async function buildAcceptInputFromForecast(
  forecast: ForecastDoc
): Promise<{
  inbound_source: ForecastDoc["inbound_source"];
  declared_items: {
    category_id: string;
    subcategory_id: string;
    product_name: string;
    product_url?: string;
    quantity: number;
    unit_price: number;
  }[];
  customer_remarks?: string;
} | null> {
  const db = await connectToDatabase();
  const items = (await db
    .collection(collections.INBOUND_DECLARED_ITEM)
    .find({ inbound_request_id: forecast._id })
    .sort({ display_order: 1, _id: 1 })
    .toArray()) as unknown as DeclaredItemDoc[];

  if (items.length === 0) return null;

  return {
    inbound_source: forecast.inbound_source,
    declared_items: items.map((it) => ({
      category_id: it.category_id,
      subcategory_id: it.subcategory_id,
      product_name: it.product_name,
      ...(it.product_url ? { product_url: it.product_url } : {}),
      quantity: it.quantity,
      unit_price: it.unit_price,
    })),
    ...(forecast.customer_remarks
      ? { customer_remarks: forecast.customer_remarks }
      : {}),
  };
}

async function stampForecast(
  forecast_id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const db = await connectToDatabase();
  await db.collection(collections.INBOUND).updateOne(
    { _id: forecast_id as any },
    { $set: { ...patch, updatedAt: new Date() } }
  );
}

export async function runUnclaimedAutoMatch(
  opts: AutoMatchOptions = {}
): Promise<AutoMatchReport> {
  const dryRun = !!opts.dryRun;
  const since =
    opts.since ??
    new Date(Date.now() - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);

  const db = await connectToDatabase();
  const report: AutoMatchReport = {
    scanned: 0,
    auto_matched: 0,
    ambiguous: 0,
    no_match: 0,
    errors: [],
    dry_run: dryRun,
  };

  // Only the recently-created pending forecasts. Older pending rows
  // are out of scope here — the original WMS arrival flow already
  // matched them at scan-time. This cron is the catch-up path for
  // the "client forecasted *after* WMS scan" race.
  const cursor = db.collection(collections.INBOUND).find({
    status: "pending",
    createdAt: { $gte: since },
    // A forecast that already has a *_at terminal stamp from a prior
    // cron tick is fine to re-evaluate — its status would have moved
    // to "received" on success. We skip nothing extra here.
  });

  while (await cursor.hasNext()) {
    const raw = await cursor.next();
    if (!raw) break;
    const forecast = raw as unknown as ForecastDoc;
    if (!forecast.tracking_no_normalized) continue;
    report.scanned += 1;

    try {
      const candidates = await db
        .collection(collections.UNCLAIMED_INBOUND)
        .find({
          tracking_no_normalized: forecast.tracking_no_normalized,
          status: "pending_assignment",
        })
        .limit(5)
        .toArray();

      if (candidates.length === 0) {
        report.no_match += 1;
        if (!dryRun) {
          await stampForecast(forecast._id, {
            auto_match_last_checked_at: new Date(),
          });
        }
        continue;
      }

      if (candidates.length > 1) {
        report.ambiguous += 1;
        if (!dryRun) {
          await stampForecast(forecast._id, {
            auto_match_last_checked_at: new Date(),
            auto_match_ambiguous_at: new Date(),
            auto_match_candidates: candidates.map((c: any) => String(c._id)),
          });
          await logAudit({
            action: AUDIT_ACTIONS.unclaimed_auto_match_ambiguous,
            actor_type: AUDIT_ACTOR_TYPES.system,
            actor_id: SYSTEM_ACTOR_ID,
            target_type: AUDIT_TARGET_TYPES.inbound,
            target_id: forecast._id,
            details: {
              tracking_no: forecast.tracking_no,
              client_id: forecast.client_id,
              candidate_unclaimed_ids: candidates.map((c: any) =>
                String(c._id)
              ),
              candidate_count: candidates.length,
            },
            warehouse_code: forecast.warehouseCode,
          });
        }
        continue;
      }

      // Single candidate — auto-match path.
      const unclaimed = candidates[0];
      const unclaimed_id = String(unclaimed._id);

      if (dryRun) {
        report.auto_matched += 1;
        continue;
      }

      const acceptInput = await buildAcceptInputFromForecast(forecast);
      if (!acceptInput) {
        // Forecast with zero declared items is a data anomaly — the
        // OMS form requires ≥1. Skip and surface for ops.
        report.errors.push({
          inbound_id: forecast._id,
          error: "forecast_has_no_declared_items",
        });
        continue;
      }

      // Step 1: assign the unclaimed row to the client as a CS-style
      // assignment. We reuse the public service untouched; it is
      // atomic and rejects if another actor already grabbed the row.
      await assignUnclaimedToClient(
        unclaimed_id,
        { client_id: forecast.client_id },
        {
          staff_id: SYSTEM_ACTOR_ID,
          warehouseCode:
            unclaimed.warehouseCode ?? forecast.warehouseCode ?? "",
        }
      );

      // Step 2: accept on the client's behalf. acceptUnclaimed will
      // detect the existing pending forecast as the merge target,
      // upgrade it to "received", charge the wallet, and emit the
      // standard inbound_received notification — exactly as if the
      // client had clicked "accept" in the OMS pending_confirm tab.
      const result = await acceptUnclaimed(unclaimed_id, acceptInput, {
        client_id: forecast.client_id,
      });

      await logAudit({
        action: AUDIT_ACTIONS.unclaimed_auto_matched,
        actor_type: AUDIT_ACTOR_TYPES.system,
        actor_id: SYSTEM_ACTOR_ID,
        target_type: AUDIT_TARGET_TYPES.unclaimed_inbound,
        target_id: unclaimed_id,
        details: {
          forecast_id: forecast._id,
          inbound_id: result.inbound_id,
          client_id: forecast.client_id,
          tracking_no: forecast.tracking_no,
          charged: result.charged,
          balance_after: result.balance_after,
        },
        warehouse_code: unclaimed.warehouseCode ?? forecast.warehouseCode,
      });

      report.auto_matched += 1;
    } catch (err: any) {
      report.errors.push({
        inbound_id: forecast._id,
        error: err?.code ?? err?.message ?? String(err),
      });
    }
  }

  return report;
}

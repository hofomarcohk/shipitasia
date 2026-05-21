// P17 — unclaimed-pool 30-day abandonment scanner.
//
// Runs once per HK calendar day (see scripts/cron.ts). Scans every
// pending_assignment row in unclaimed_inbounds and emits up to one
// warning per age threshold:
//
//   14 HK-days  → "14d"           : reminder notification (if assigned)
//   25 HK-days  → "25d"           : final warning   (if assigned)
//   30 HK-days  → "30d_abandoned" : disposed (status → "disposed",
//                                   abandoned_at set), notification sent
//
// Idempotent by warning_stages: each stage written once. Re-running on
// the same day is a no-op for rows that already have the stage.
//
// Notifications only fire when there is an active assignment (CS or
// auto-match has linked a client_id). Truly orphan rows still get the
// warning_stages entries so audit history is preserved, but no client
// receives an email.
//
// Returns a per-warehouse summary so the cron driver can log + the
// admin trigger route can return a useful response for ops smoke
// tests.

import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { hkDaysBetween } from "@/lib/time-hk";
import { logAudit } from "@/services/audit/log";
import { createNotification } from "@/services/notification/notification";

const WARNING_THRESHOLDS = [
  { stage: "14d", days: 14 },
  { stage: "25d", days: 25 },
  { stage: "30d_abandoned", days: 30 },
] as const;

type WarningStage = (typeof WARNING_THRESHOLDS)[number]["stage"];

export interface AbandonScanReport {
  scanned: number;
  warnings_sent: Record<WarningStage, number>;
  abandoned: number;
  notifications_sent: number;
  errors: { unclaimed_id: string; error: string }[];
}

function findActiveAssignmentClientId(row: any): string | null {
  // Mirror unclaimed-service.findActiveAssignment but as a pure read.
  // pending_assignment + assigned_to_client_id is the simplest signal;
  // disposed rows are filtered upstream.
  return row?.assigned_to_client_id ?? null;
}

function notificationCopyFor(
  stage: WarningStage,
  daysOld: number,
  tracking_no: string,
  unclaimed_id: string
): { type: string; title: string; body: string } {
  if (stage === "14d") {
    return {
      type: "unclaimed_warning_14d",
      title: "無頭件提醒：請盡快認領",
      body: `貨物 ${tracking_no} (${unclaimed_id}) 已到倉 ${daysOld} 天未認領。距離自動廢棄還有 ${30 - daysOld} 天。請於 OMS 確認認領。`,
    };
  }
  if (stage === "25d") {
    return {
      type: "unclaimed_warning_25d",
      title: "無頭件最後提醒：5 天內未認領將廢棄",
      body: `貨物 ${tracking_no} (${unclaimed_id}) 已到倉 ${daysOld} 天未認領。如 5 天內仍未確認，將自動視為廢棄件且無法恢復。`,
    };
  }
  return {
    type: "unclaimed_warning_30d_abandoned",
    title: "無頭件已自動廢棄",
    body: `貨物 ${tracking_no} (${unclaimed_id}) 到倉超過 30 天無認領，已自動視為廢棄件。如需處理請聯絡 CS。`,
  };
}

async function processRow(
  row: any,
  now: Date,
  report: AbandonScanReport
): Promise<void> {
  const db = await connectToDatabase();
  const existing: WarningStage[] = (row.warning_stages ?? []).map(
    (s: any) => s?.stage
  );
  const daysOld = hkDaysBetween(row.arrived_at, now);

  for (const t of WARNING_THRESHOLDS) {
    if (daysOld < t.days) break; // thresholds sorted ascending
    if (existing.includes(t.stage)) continue; // already emitted

    const isAbandon = t.stage === "30d_abandoned";
    const client_id = findActiveAssignmentClientId(row);

    // Stage write + (for 30d) status mutation are a single update so a
    // crash mid-loop can't double-abandon.
    const set: Record<string, unknown> = { updatedAt: now };
    if (isAbandon) {
      set.status = "disposed";
      set.abandoned_at = now;
      set.disposed_at = now;
      set.disposed_reason = "auto_abandon_30d";
    }
    await db.collection(collections.UNCLAIMED_INBOUND).updateOne(
      {
        _id: row._id,
        // Only stamp the 30d abandon if still pending — avoid racing a
        // late client claim. The 14/25 day stages are safe regardless.
        ...(isAbandon ? { status: "pending_assignment" } : {}),
        // Idempotency belt: do not push the same stage twice if a
        // concurrent run got there first.
        "warning_stages.stage": { $ne: t.stage },
      },
      {
        $set: set,
        $push: {
          warning_stages: { stage: t.stage, sent_at: now },
        } as any,
      }
    );
    report.warnings_sent[t.stage] += 1;
    if (isAbandon) report.abandoned += 1;

    if (client_id) {
      const copy = notificationCopyFor(
        t.stage,
        daysOld,
        row.tracking_no,
        String(row._id)
      );
      try {
        await createNotification({
          client_id,
          type: copy.type as any,
          title: copy.title,
          body: copy.body,
          reference_type: "unclaimed_inbound",
          reference_id: String(row._id),
        });
        report.notifications_sent += 1;
      } catch (err: any) {
        report.errors.push({
          unclaimed_id: String(row._id),
          error: `notify_${t.stage}: ${err?.message ?? err}`,
        });
      }
    }

    await logAudit({
      action: isAbandon
        ? AUDIT_ACTIONS.unclaimed_disposed
        : AUDIT_ACTIONS.unclaimed_arrived,
      actor_type: AUDIT_ACTOR_TYPES.system,
      actor_id: "system:abandon-cron",
      target_type: AUDIT_TARGET_TYPES.unclaimed_inbound,
      target_id: String(row._id),
      details: {
        stage: t.stage,
        days_old: daysOld,
        notified_client_id: client_id,
        source: "abandon_scan",
      },
      warehouse_code: row.warehouseCode ?? null,
    });
  }
}

export async function scanForAbandonment(): Promise<AbandonScanReport> {
  const db = await connectToDatabase();
  const now = new Date();
  const report: AbandonScanReport = {
    scanned: 0,
    warnings_sent: { "14d": 0, "25d": 0, "30d_abandoned": 0 },
    abandoned: 0,
    notifications_sent: 0,
    errors: [],
  };

  // Only scan pending_assignment rows; disposed / assigned-then-accepted
  // rows are out of the abandonment loop by definition.
  const cursor = db
    .collection(collections.UNCLAIMED_INBOUND)
    .find({ status: "pending_assignment" })
    .sort({ arrived_at: 1 });

  while (await cursor.hasNext()) {
    const row = await cursor.next();
    if (!row) break;
    report.scanned += 1;
    try {
      await processRow(row, now, report);
    } catch (err: any) {
      report.errors.push({
        unclaimed_id: String(row._id),
        error: err?.message ?? String(err),
      });
    }
  }

  return report;
}

// P17 — WMS home dashboard service.
//
// Feeds the #home page (handoff). Bundles KPI strip, funnel, NOW
// card recommendation, today's run sheet, and an anomalies list into
// a single response so the page hydrates with one fetch.
//
// Several derivations are heuristic placeholders documented inline —
// they're intentionally simple so the handoff UI can ship; the run
// sheet template and NOW card priority order are the most likely
// items to grow product-specific rules later.

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { addHkDays, endOfHkDay, startOfHkDay } from "@/lib/time-hk";

export interface DashboardKpis {
  outbound_today: number;
  inbound_today: number;
  unclaimed_pending: number;
  anomalies: number;
  cutoff_countdown_ms: number;
  cutoff_at: Date;
}

export interface DashboardFunnel {
  ready_for_label: number;
  picking: number;
  packing: number;
  weighing: number;
  printing: number;
  ready_to_depart: number;
}

export type RunSheetState = "done" | "current" | "todo";

export interface RunSheetItem {
  time: string;
  title: string;
  flow: "consol" | "yt" | "ops";
  count: number;
  state: RunSheetState;
  action_url: string;
}

export type NowCardKind =
  | "anomaly"
  | "unclaimed_urgent"
  | "weigh"
  | "print"
  | "pickup"
  | "pick_batch"
  | "idle";

export interface NowCard {
  kind: NowCardKind;
  title: string;
  hint: string;
  count: number;
  action_url: string;
  countdown_ms: number | null;
}

export interface AnomalyEntry {
  outbound_id: string;
  client_id: string;
  held_reason: string | null;
  held_detail: string | null;
  held_since: Date | null;
}

export interface WmsDashboard {
  kpis: DashboardKpis;
  funnel: DashboardFunnel;
  now_card: NowCard;
  run_sheet: RunSheetItem[];
  anomalies: AnomalyEntry[];
}

// Daily cutoff for "today's outbound run" — 18:00 HK. Hard-coded for
// v1; per-warehouse override lives in working_calendars (future).
function todaysCutoff(now: Date = new Date()): Date {
  const dayStart = startOfHkDay(now);
  return new Date(dayStart.getTime() + 18 * 60 * 60 * 1000);
}

// Default daily template. Each entry is a heuristic anchor — count +
// state derive from current outbound state at fetch time.
const RUN_SHEET_TEMPLATE: Array<
  Omit<RunSheetItem, "count" | "state"> & {
    stageStatuses: string[];
  }
> = [
  {
    time: "09:00",
    title: "收貨上架",
    flow: "ops",
    action_url: "/zh-hk/wms/operations/receive",
    stageStatuses: [], // not outbound-driven
  },
  {
    time: "10:00",
    title: "建揀貨批次",
    flow: "consol",
    action_url: "/zh-hk/wms/operations/pick-batch",
    stageStatuses: ["ready_for_label"],
  },
  {
    time: "11:30",
    title: "裝箱",
    flow: "consol",
    action_url: "/zh-hk/wms/operations/pack",
    stageStatuses: ["picked", "packing"],
  },
  {
    time: "13:30",
    title: "秤重置板",
    flow: "consol",
    action_url: "/zh-hk/wms/operations/weigh",
    stageStatuses: ["packed", "weighing"],
  },
  {
    time: "15:00",
    title: "印面單 + 安排攬收",
    flow: "consol",
    action_url: "/zh-hk/wms/operations/label-print",
    stageStatuses: ["label_obtained", "label_printed"],
  },
  {
    time: "16:30",
    title: "離站雙掃",
    flow: "consol",
    action_url: "/zh-hk/wms/operations/depart",
    stageStatuses: ["label_printed"],
  },
];

async function loadOutboundStatusCounts(
  warehouseCode: string
): Promise<Map<string, number>> {
  const db = await connectToDatabase();
  // Today + open work — count rows by status. We include "departed"
  // so KPIs can show today's出貨 total.
  const rows = await db
    .collection(collections.OUTBOUND)
    .aggregate([
      { $match: { warehouseCode } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r: any) => [r._id, r.count as number]));
}

async function loadDashboardKpis(
  warehouseCode: string,
  now: Date,
  statusCounts: Map<string, number>
): Promise<DashboardKpis> {
  const db = await connectToDatabase();
  const dayStart = startOfHkDay(now);
  const dayEnd = endOfHkDay(now);

  const [outbound_today, inbound_today_forecast, inbound_today_unclaimed, unclaimed_pending] =
    await Promise.all([
      db.collection(collections.OUTBOUND).countDocuments({
        warehouseCode,
        createdAt: { $gte: dayStart, $lte: dayEnd },
      }),
      db.collection(collections.INBOUND).countDocuments({
        warehouseCode,
        arrivedAt: { $gte: dayStart, $lte: dayEnd },
      }),
      db.collection(collections.UNCLAIMED_INBOUND).countDocuments({
        warehouseCode,
        arrived_at: { $gte: dayStart, $lte: dayEnd },
      }),
      db.collection(collections.UNCLAIMED_INBOUND).countDocuments({
        warehouseCode,
        status: "pending_assignment",
      }),
    ]);

  const cutoff_at = todaysCutoff(now);
  // Show 0 (not negative) once cutoff has passed; the UI flips to a
  // post-cutoff state instead of a countdown.
  const cutoff_countdown_ms = Math.max(0, cutoff_at.getTime() - now.getTime());

  return {
    outbound_today,
    inbound_today: inbound_today_forecast + inbound_today_unclaimed,
    unclaimed_pending,
    anomalies: statusCounts.get("held") ?? 0,
    cutoff_countdown_ms,
    cutoff_at,
  };
}

function buildFunnel(statusCounts: Map<string, number>): DashboardFunnel {
  const c = (s: string) => statusCounts.get(s) ?? 0;
  return {
    ready_for_label: c("ready_for_label"),
    picking: c("picking") + c("picked"),
    packing: c("packing") + c("packed"),
    weighing: c("weighing") + c("weight_verified"),
    printing: c("label_obtaining") + c("label_obtained") + c("label_printed"),
    ready_to_depart: c("label_printed"),
  };
}

async function buildRunSheet(
  statusCounts: Map<string, number>
): Promise<RunSheetItem[]> {
  return RUN_SHEET_TEMPLATE.map((t) => {
    const count = t.stageStatuses.reduce(
      (acc, s) => acc + (statusCounts.get(s) ?? 0),
      0
    );
    // state heuristic: count > 0 → current (active work to do at this
    // stage). Future enhancement: time-of-day → done/current/todo
    // based on wall-clock vs t.time + warehouse calendar.
    const state: RunSheetState = count > 0 ? "current" : "todo";
    return {
      time: t.time,
      title: t.title,
      flow: t.flow,
      action_url: t.action_url,
      count,
      state,
    };
  });
}

async function loadAnomalies(
  warehouseCode: string
): Promise<AnomalyEntry[]> {
  const db = await connectToDatabase();
  const rows = await db
    .collection(collections.OUTBOUND)
    .find({
      warehouseCode,
      status: "held",
    })
    .sort({ held_since: 1 })
    .limit(5)
    .project({
      _id: 1,
      client_id: 1,
      held_reason: 1,
      held_detail: 1,
      held_since: 1,
    })
    .toArray();
  return rows.map((r: any) => ({
    outbound_id: String(r._id),
    client_id: r.client_id,
    held_reason: r.held_reason ?? null,
    held_detail: r.held_detail ?? null,
    held_since: r.held_since ?? null,
  }));
}

async function pickNowCard(
  warehouseCode: string,
  statusCounts: Map<string, number>,
  kpis: DashboardKpis,
  now: Date
): Promise<NowCard> {
  const db = await connectToDatabase();
  const fallbackCountdown = kpis.cutoff_countdown_ms;

  if (kpis.anomalies > 0) {
    return {
      kind: "anomaly",
      title: "處理異常出庫單",
      hint: `${kpis.anomalies} 張單被 hold，請先解除`,
      count: kpis.anomalies,
      action_url: "/zh-hk/wms/operations/outbound-list?filter=held",
      countdown_ms: fallbackCountdown,
    };
  }

  // 28d threshold: parcels arrived ≥ 28 HK-days ago are within 2 days
  // of auto-abandon; treat as urgent.
  const urgentBefore = addHkDays(startOfHkDay(now), -28);
  const urgentUnclaimed = await db
    .collection(collections.UNCLAIMED_INBOUND)
    .countDocuments({
      warehouseCode,
      status: "pending_assignment",
      arrived_at: { $lte: urgentBefore },
    });
  if (urgentUnclaimed > 0) {
    return {
      kind: "unclaimed_urgent",
      title: "緊急：無頭件即將廢棄",
      hint: `${urgentUnclaimed} 件入倉 ≥ 28 日，請 CS 即時處理`,
      count: urgentUnclaimed,
      action_url: "/zh-hk/wms/operations/unclaimed-inbounds",
      countdown_ms: fallbackCountdown,
    };
  }

  const weighing =
    (statusCounts.get("weighing") ?? 0) +
    (statusCounts.get("packed") ?? 0);
  if (weighing > 0) {
    return {
      kind: "weigh",
      title: "繼續秤重置板",
      hint: `${weighing} 張出庫單未秤完`,
      count: weighing,
      action_url: "/zh-hk/wms/operations/weigh",
      countdown_ms: fallbackCountdown,
    };
  }

  const labelObtained = statusCounts.get("label_obtained") ?? 0;
  if (labelObtained > 0) {
    return {
      kind: "print",
      title: "印面單",
      hint: `${labelObtained} 張單已取單未印`,
      count: labelObtained,
      action_url: "/zh-hk/wms/operations/label-print",
      countdown_ms: fallbackCountdown,
    };
  }

  // label_printed but no pickup yet → schedule pickup
  const printedNoPickup = await db
    .collection(collections.OUTBOUND)
    .countDocuments({
      warehouseCode,
      status: "label_printed",
      pickup_request_id: { $in: [null, undefined] as any },
    });
  if (printedNoPickup > 0) {
    return {
      kind: "pickup",
      title: "安排攬收",
      hint: `${printedNoPickup} 張單已印未約攬收`,
      count: printedNoPickup,
      action_url: "/zh-hk/wms/operations/label-print",
      countdown_ms: fallbackCountdown,
    };
  }

  const readyForLabel = statusCounts.get("ready_for_label") ?? 0;
  if (readyForLabel > 0) {
    return {
      kind: "pick_batch",
      title: "建揀貨批次",
      hint: `${readyForLabel} 張單待揀`,
      count: readyForLabel,
      action_url: "/zh-hk/wms/operations/pick-batch",
      countdown_ms: fallbackCountdown,
    };
  }

  return {
    kind: "idle",
    title: "今日工作已完成",
    hint: "可以開始準備明日嘅貨",
    count: 0,
    action_url: "/zh-hk/wms/operations/outbound-list",
    countdown_ms: null,
  };
}

export async function getWmsDashboard(
  warehouseCode: string
): Promise<WmsDashboard> {
  const now = new Date();
  const statusCounts = await loadOutboundStatusCounts(warehouseCode);
  const [kpis, run_sheet, anomalies] = await Promise.all([
    loadDashboardKpis(warehouseCode, now, statusCounts),
    buildRunSheet(statusCounts),
    loadAnomalies(warehouseCode),
  ]);
  const now_card = await pickNowCard(warehouseCode, statusCounts, kpis, now);
  return {
    kpis,
    funnel: buildFunnel(statusCounts),
    now_card,
    run_sheet,
    anomalies,
  };
}

// WMS operations dashboard service (redesigned).
//
// The home page is now a real ops cockpit: live stage-board WIP counts,
// throughput over today / 7d / 30d windows, a 7-day daily trend, a
// real-time outbound funnel, and an anomalies queue. One fetch hydrates
// the whole page.
//
// Time buckets use HK calendar boundaries (startOfHkDay + addHkDays) so
// "today" matches the warehouse's local day, not UTC.

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { WAREHOUSE_TIMEZONE, addHkDays, startOfHkDay } from "@/lib/time-hk";

export type StageTone = "neutral" | "active" | "warn" | "done";

export interface StageCard {
  key: string;
  label: string;
  count: number;
  unit: string; // 件 / 單 / 箱
  tone: StageTone;
  action_url: string;
  hint?: string;
}

export interface ThroughputMetric {
  key: string;
  label: string;
  unit: string;
  today: number;
  d7: number;
  d30: number;
}

export interface TrendDay {
  date: string; // YYYY-MM-DD (HK)
  label: string; // e.g. "6/4 三"
  outbound: number; // outbounds departed that day
  inbound: number; // inbounds received that day
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

export interface AnomalyEntry {
  outbound_id: string;
  client_id: string;
  status: string;
  held_reason: string | null;
  held_detail: string | null;
  held_since: Date | null;
}

export interface DashboardHeadline {
  inbound_arrived_today: number;
  outbound_departed_today: number;
  wip_total: number;
  anomalies: number;
}

export interface WmsDashboard {
  headline: DashboardHeadline;
  stage_board: StageCard[];
  throughput: ThroughputMetric[];
  trend_7d: TrendDay[];
  funnel: FunnelStage[];
  anomalies: AnomalyEntry[];
  generated_at: Date;
}

// Non-terminal outbound statuses — everything still "in the building".
const WIP_STATUSES = [
  "ready_for_label",
  "picking",
  "picked",
  "packing",
  "packed",
  "weighing",
  "weight_verified",
  "label_obtaining",
  "label_obtained",
  "label_printed",
  "pending_client_label",
  "held",
];

async function loadOutboundStatusCounts(
  warehouseCode: string
): Promise<Map<string, number>> {
  const db = await connectToDatabase();
  const rows = await db
    .collection(collections.OUTBOUND)
    .aggregate([
      { $match: { warehouseCode } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r: any) => [r._id, r.count as number]));
}

function sum(counts: Map<string, number>, keys: string[]): number {
  return keys.reduce((acc, k) => acc + (counts.get(k) ?? 0), 0);
}

function buildStageBoard(
  counts: Map<string, number>,
  pendingReceive: number
): StageCard[] {
  return [
    {
      key: "receive",
      label: "待收貨",
      count: pendingReceive,
      unit: "件",
      tone: pendingReceive > 0 ? "active" : "neutral",
      action_url: "/zh-hk/wms/operations/receive",
      hint: "已到倉未上架",
    },
    {
      key: "pick",
      label: "待揀貨",
      count: sum(counts, ["ready_for_label"]),
      unit: "單",
      tone: sum(counts, ["ready_for_label"]) > 0 ? "active" : "neutral",
      action_url: "/zh-hk/wms/operations/pick-batch",
      hint: "可建揀貨批次",
    },
    {
      key: "picking",
      label: "揀貨中",
      count: sum(counts, ["picking", "picked"]),
      unit: "單",
      tone: sum(counts, ["picking", "picked"]) > 0 ? "active" : "neutral",
      action_url: "/zh-hk/wms/operations/pick-confirm",
    },
    {
      key: "pack",
      label: "裝箱中",
      count: sum(counts, ["packing", "packed"]),
      unit: "單",
      tone: sum(counts, ["packing", "packed"]) > 0 ? "active" : "neutral",
      action_url: "/zh-hk/wms/operations/pack",
    },
    {
      key: "weigh",
      label: "秤重取單",
      count: sum(counts, ["weighing", "weight_verified", "label_obtaining"]),
      unit: "單",
      tone:
        sum(counts, ["weighing", "weight_verified", "label_obtaining"]) > 0
          ? "active"
          : "neutral",
      action_url: "/zh-hk/wms/operations/weigh",
    },
    {
      key: "depart",
      label: "待離站",
      count: sum(counts, ["label_obtained", "label_printed"]),
      unit: "單",
      tone: sum(counts, ["label_obtained", "label_printed"]) > 0 ? "active" : "neutral",
      action_url: "/zh-hk/wms/operations/depart",
      hint: "已取單待出貨",
    },
    {
      key: "reprint",
      label: "補單 / 異常",
      count: sum(counts, ["pending_client_label", "held"]),
      unit: "單",
      tone: sum(counts, ["pending_client_label", "held"]) > 0 ? "warn" : "neutral",
      action_url: "/zh-hk/wms/operations/label-print",
      hint: "取單失敗待重試",
    },
  ];
}

function buildFunnel(counts: Map<string, number>): FunnelStage[] {
  return [
    { key: "ready", label: "待揀", count: sum(counts, ["ready_for_label"]) },
    { key: "picking", label: "揀貨", count: sum(counts, ["picking", "picked"]) },
    { key: "packing", label: "裝箱", count: sum(counts, ["packing", "packed"]) },
    {
      key: "weighing",
      label: "秤重取單",
      count: sum(counts, ["weighing", "weight_verified", "label_obtaining"]),
    },
    {
      key: "depart",
      label: "待離站",
      count: sum(counts, ["label_obtained", "label_printed"]),
    },
  ];
}

// Counts documents in [start, now] on the given date field.
async function countInWindow(
  collection: string,
  warehouseCode: string,
  field: string,
  start: Date
): Promise<number> {
  const db = await connectToDatabase();
  return db.collection(collection).countDocuments({
    warehouseCode,
    [field]: { $gte: start },
  });
}

async function countBoxesInWindow(
  outboundIds: string[],
  start: Date
): Promise<number> {
  if (outboundIds.length === 0) return 0;
  const db = await connectToDatabase();
  return db.collection(collections.OUTBOUND_BOX).countDocuments({
    outbound_id: { $in: outboundIds },
    dual_scan_at: { $gte: start },
  });
}

async function buildThroughput(
  warehouseCode: string,
  now: Date
): Promise<ThroughputMetric[]> {
  const db = await connectToDatabase();
  const todayStart = startOfHkDay(now);
  const d7Start = addHkDays(todayStart, -6);
  const d30Start = addHkDays(todayStart, -29);

  // Boxes departed need the set of outbound ids for this warehouse;
  // pull them once and reuse across windows.
  const whOutboundIds = (
    await db
      .collection(collections.OUTBOUND)
      .find({ warehouseCode })
      .project({ _id: 1 })
      .toArray()
  ).map((d: any) => String(d._id));

  const [
    recvToday, recv7, recv30,
    outToday, out7, out30,
    boxToday, box7, box30,
    lblToday, lbl7, lbl30,
  ] = await Promise.all([
    countInWindow(collections.INBOUND, warehouseCode, "receivedAt", todayStart),
    countInWindow(collections.INBOUND, warehouseCode, "receivedAt", d7Start),
    countInWindow(collections.INBOUND, warehouseCode, "receivedAt", d30Start),
    countInWindow(collections.OUTBOUND, warehouseCode, "departed_at", todayStart),
    countInWindow(collections.OUTBOUND, warehouseCode, "departed_at", d7Start),
    countInWindow(collections.OUTBOUND, warehouseCode, "departed_at", d30Start),
    countBoxesInWindow(whOutboundIds, todayStart),
    countBoxesInWindow(whOutboundIds, d7Start),
    countBoxesInWindow(whOutboundIds, d30Start),
    countInWindow(collections.OUTBOUND, warehouseCode, "label_obtained_at", todayStart),
    countInWindow(collections.OUTBOUND, warehouseCode, "label_obtained_at", d7Start),
    countInWindow(collections.OUTBOUND, warehouseCode, "label_obtained_at", d30Start),
  ]);

  return [
    { key: "received", label: "到倉收貨", unit: "件", today: recvToday, d7: recv7, d30: recv30 },
    { key: "departed_ob", label: "出貨離站", unit: "單", today: outToday, d7: out7, d30: out30 },
    { key: "departed_box", label: "離站箱數", unit: "箱", today: boxToday, d7: box7, d30: box30 },
    { key: "label", label: "取單成功", unit: "張", today: lblToday, d7: lbl7, d30: lbl30 },
  ];
}

async function buildTrend7d(
  warehouseCode: string,
  now: Date
): Promise<TrendDay[]> {
  const db = await connectToDatabase();
  const todayStart = startOfHkDay(now);
  const windowStart = addHkDays(todayStart, -6);

  const dayKey = (field: string) => ({
    $dateToString: {
      date: `$${field}`,
      format: "%Y-%m-%d",
      timezone: WAREHOUSE_TIMEZONE,
    },
  });

  const [outRows, inRows] = await Promise.all([
    db
      .collection(collections.OUTBOUND)
      .aggregate([
        { $match: { warehouseCode, departed_at: { $gte: windowStart } } },
        { $group: { _id: dayKey("departed_at"), n: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection(collections.INBOUND)
      .aggregate([
        { $match: { warehouseCode, receivedAt: { $gte: windowStart } } },
        { $group: { _id: dayKey("receivedAt"), n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const outByDay = new Map(outRows.map((r: any) => [r._id, r.n as number]));
  const inByDay = new Map(inRows.map((r: any) => [r._id, r.n as number]));

  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const days: TrendDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addHkDays(todayStart, -i);
    // Build the HK date key the same way Mongo did.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: WAREHOUSE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")!.value;
    const m = parts.find((p) => p.type === "month")!.value;
    const dd = parts.find((p) => p.type === "day")!.value;
    const key = `${y}-${m}-${dd}`;
    const wd = new Date(d).getDay();
    days.push({
      date: key,
      label: `${Number(m)}/${Number(dd)} ${weekdays[wd]}`,
      outbound: (outByDay.get(key) as number) ?? 0,
      inbound: (inByDay.get(key) as number) ?? 0,
    });
  }
  return days;
}

async function loadAnomalies(warehouseCode: string): Promise<AnomalyEntry[]> {
  const db = await connectToDatabase();
  const rows = await db
    .collection(collections.OUTBOUND)
    .find({
      warehouseCode,
      $or: [{ status: "held" }, { status: "pending_client_label" }],
    })
    .sort({ held_since: 1, updatedAt: 1 })
    .limit(8)
    .project({
      _id: 1,
      client_id: 1,
      status: 1,
      held_reason: 1,
      held_detail: 1,
      held_since: 1,
    })
    .toArray();
  return rows.map((r: any) => ({
    outbound_id: String(r._id),
    client_id: r.client_id,
    status: r.status,
    held_reason: r.held_reason ?? null,
    held_detail: r.held_detail ?? null,
    held_since: r.held_since ?? null,
  }));
}

export async function getWmsDashboard(
  warehouseCode: string
): Promise<WmsDashboard> {
  const now = new Date();
  const db = await connectToDatabase();
  const todayStart = startOfHkDay(now);

  const statusCounts = await loadOutboundStatusCounts(warehouseCode);

  const [
    pendingReceive,
    inboundArrivedToday,
    outboundDepartedToday,
    throughput,
    trend_7d,
    anomalies,
  ] = await Promise.all([
    db.collection(collections.INBOUND).countDocuments({
      warehouseCode,
      status: "arrived",
    }),
    db.collection(collections.INBOUND).countDocuments({
      warehouseCode,
      arrivedAt: { $gte: todayStart },
    }),
    db.collection(collections.OUTBOUND).countDocuments({
      warehouseCode,
      departed_at: { $gte: todayStart },
    }),
    buildThroughput(warehouseCode, now),
    buildTrend7d(warehouseCode, now),
    loadAnomalies(warehouseCode),
  ]);

  const wip_total = sum(statusCounts, WIP_STATUSES);
  const anomalyCount =
    sum(statusCounts, ["held", "pending_client_label"]);

  return {
    headline: {
      inbound_arrived_today: inboundArrivedToday,
      outbound_departed_today: outboundDepartedToday,
      wip_total,
      anomalies: anomalyCount,
    },
    stage_board: buildStageBoard(statusCounts, pendingReceive),
    throughput,
    trend_7d,
    funnel: buildFunnel(statusCounts),
    anomalies,
    generated_at: now,
  };
}

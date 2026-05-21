// P17 — task-queue aggregator for handoff #queue page.
//
// Returns a flat list of actionable tasks across every WMS surface,
// each annotated with kind / count / urgency / deep-link so a click
// on the queue row jumps to the right page.
//
// Same status-count primitive the dashboard uses; this is just a
// different shape (flat list vs. KPI bundle). Two extras:
//   - urgency-tagged unclaimed slice (28d+)
//   - pending topup counter
//
// Items with count=0 are filtered out so the UI list is never padded
// with noise; if the warehouse genuinely has nothing pending the list
// is empty and the page renders its "今日清空" state.

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { addHkDays, startOfHkDay } from "@/lib/time-hk";

export type QueueTaskKind =
  | "pick_batch"
  | "pack"
  | "weigh"
  | "print"
  | "pickup"
  | "depart"
  | "unclaimed_assign"
  | "unclaimed_urgent"
  | "anomaly_held"
  | "topup_pending";

export type QueueTaskUrgency = "normal" | "warn" | "urgent";

export interface QueueTask {
  id: string;
  kind: QueueTaskKind;
  title: string;
  detail: string;
  count: number;
  urgency: QueueTaskUrgency;
  action_url: string;
}

async function loadStatusCounts(
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

export async function listQueueTasks(
  warehouseCode: string
): Promise<QueueTask[]> {
  const db = await connectToDatabase();
  const counts = await loadStatusCounts(warehouseCode);
  const c = (s: string) => counts.get(s) ?? 0;

  const now = new Date();
  const urgentBefore = addHkDays(startOfHkDay(now), -28);
  const [unclaimedPending, unclaimedUrgent, printedNoPickup, topupPending] =
    await Promise.all([
      db.collection(collections.UNCLAIMED_INBOUND).countDocuments({
        warehouseCode,
        status: "pending_assignment",
      }),
      db.collection(collections.UNCLAIMED_INBOUND).countDocuments({
        warehouseCode,
        status: "pending_assignment",
        arrived_at: { $lte: urgentBefore },
      }),
      db.collection(collections.OUTBOUND).countDocuments({
        warehouseCode,
        status: "label_printed",
        pickup_request_id: { $in: [null, undefined] as any },
      }),
      db
        .collection(collections.TOPUP_REQUEST)
        .countDocuments({ status: "pending" })
        .catch(() => 0),
    ]);

  // Build candidates in the order they should appear (urgency first,
  // then process order). Skip zero-counts before returning.
  const candidates: QueueTask[] = [
    {
      id: "anomaly:held",
      kind: "anomaly_held",
      title: "處理異常出庫單",
      detail: "被 hold 嘅出庫單需要解除",
      count: c("held"),
      urgency: "urgent",
      action_url: "/zh-hk/wms/operations/outbound-list?filter=held",
    },
    {
      id: "unclaimed:urgent_28d",
      kind: "unclaimed_urgent",
      title: "無頭件即將廢棄",
      detail: "入倉 ≥ 28 日仍未認領，剩 ≤ 2 日",
      count: unclaimedUrgent,
      urgency: "urgent",
      action_url: "/zh-hk/wms/operations/unclaimed-inbounds?filter=urgent",
    },
    {
      id: "pick:ready",
      kind: "pick_batch",
      title: "建揀貨批次",
      detail: "已預報 + ready_for_label",
      count: c("ready_for_label"),
      urgency: "normal",
      action_url: "/zh-hk/wms/operations/pick-batch",
    },
    {
      id: "pack:open",
      kind: "pack",
      title: "裝箱進行中",
      detail: "已揀完未封箱",
      count: c("picking") + c("picked") + c("packing"),
      urgency: "normal",
      action_url: "/zh-hk/wms/operations/pack",
    },
    {
      id: "weigh:open",
      kind: "weigh",
      title: "秤重置板",
      detail: "已裝完未秤完",
      count: c("packed") + c("weighing"),
      urgency: "normal",
      action_url: "/zh-hk/wms/operations/weigh",
    },
    {
      id: "print:obtained",
      kind: "print",
      title: "印面單",
      detail: "已取單未印",
      count: c("label_obtained"),
      urgency: "warn",
      action_url: "/zh-hk/wms/operations/label-print",
    },
    {
      id: "pickup:pending",
      kind: "pickup",
      title: "安排攬收",
      detail: "已印未約攬收",
      count: printedNoPickup,
      urgency: "warn",
      action_url: "/zh-hk/wms/operations/label-print?filter=printed",
    },
    {
      id: "depart:ready",
      kind: "depart",
      title: "離站雙掃",
      detail: "等出車",
      count: c("label_printed"),
      urgency: "normal",
      action_url: "/zh-hk/wms/operations/depart",
    },
    {
      id: "unclaimed:assign",
      kind: "unclaimed_assign",
      title: "無頭件待匹配",
      detail: "已入池等 CS 認領",
      count: unclaimedPending - unclaimedUrgent,
      urgency: "normal",
      action_url: "/zh-hk/wms/operations/unclaimed-inbounds",
    },
    {
      id: "topup:pending",
      kind: "topup_pending",
      title: "儲值審核",
      detail: "客戶 topup 等審批",
      count: topupPending,
      urgency: "normal",
      action_url: "/zh-hk/wms/admin/topup-requests",
    },
  ];

  return candidates.filter((t) => t.count > 0);
}

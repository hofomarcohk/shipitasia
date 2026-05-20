import type {
  ShipmentStage,
  ShipmentStageKey,
} from "@/components/shipment/ShipmentPipeline";
import type { ShipmentChipVariant } from "@/components/shipment/ShipmentStatusBadge";
import type { TimelineRow } from "@/components/shipment/ShipmentTimeline";

/* ============================================================
 * Stage 1 — 等待入庫
 * ==========================================================*/
export type DeliveryMethod = "managed" | "direct" | "manual";

export interface WaitingInboundRow {
  id: string;
  items: string;
  sub: "not_arrived" | "arrived";
  method: DeliveryMethod;
  recipient: string;
  carrier: string;
  time: string;
}

export const METHOD_LABEL: Record<DeliveryMethod, string> = {
  managed: "託管寄送",
  direct: "單一直送",
  manual: "手動併貨",
};

export const WAITING_INBOUND_ROWS: WaitingInboundRow[] = [
  { id: "JP1234567890", items: "無線耳機 ×2", sub: "arrived",     method: "managed", recipient: "陳大文 / 台北", carrier: "黑貓宅急便", time: "05/20 14:22" },
  { id: "JP1234567891", items: "保健品 ×1",   sub: "not_arrived", method: "managed", recipient: "陳大文 / 台北", carrier: "黑貓宅急便", time: "05/20 09:30" },
  { id: "JP2345678901", items: "服飾 ×3",     sub: "not_arrived", method: "direct",  recipient: "李小薇 / 香港", carrier: "順豐速運",   time: "05/20 09:05" },
  { id: "JP3456789012", items: "相機 ×1",     sub: "not_arrived", method: "managed", recipient: "陳大文 / 台北", carrier: "黑貓宅急便", time: "05/19 22:10" },
  { id: "JP4567890123", items: "書籍 ×6",     sub: "not_arrived", method: "manual",  recipient: "王俊明 / 台中", carrier: "日本郵便",   time: "05/19 18:45" },
  { id: "JP5678901234", items: "美妝 ×4",     sub: "arrived",     method: "managed", recipient: "李小薇 / 香港", carrier: "順豐速運",   time: "05/19 14:14" },
];

/* ============================================================
 * Stage 2 — 已上架（託管組 + 待手動建單）
 * ==========================================================*/
export interface ConsolidationGroupItem {
  id: string;
  items: string;
  price: string;
  vol?: string;
  time?: string;
  notArrived?: boolean;
}

export interface ConsolidationGroup {
  gid: string;
  recipient: string;
  carrier: string;
  total: number;
  shelved: number;
  oldestYmd?: string;
  /** ISO yyyy-mm-dd; undefined ⇒ SLA 尚未起算 (idle) */
  sweepDueYmd?: string;
  items: ConsolidationGroupItem[];
}

export type SlaVariant = "urgent" | "normal" | "idle";

export interface SlaInfo {
  variant: SlaVariant;
  text: string;
}

/** Today reference used by SLA helpers; UI uses real `new Date()`. */
const sweepNow = () => new Date();

const formatDate = (ymd: string) => {
  // yyyy-mm-dd → mm/dd
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[2]}/${m[3]}` : ymd;
};

const diffCalendarDays = (target: Date, base: Date): number => {
  const ms = target.setHours(0, 0, 0, 0) - base.setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
};

/**
 * Compute SLA variant + display text given a sweep due date.
 * Rules:
 *   - undefined          → idle ("SLA 需等齊收貨才起算")
 *   - diff ≤ 1 calendar  → urgent ("預計 mm/dd 自動出貨 · 還剩 N 工作天")
 *   - 1 < diff ≤ 5       → normal
 *   - else               → normal ("預計 mm/dd 自動出貨")
 */
export function computeSla(sweepDueYmd?: string): SlaInfo {
  if (!sweepDueYmd) {
    return { variant: "idle", text: "SLA 需等齊收貨才起算" };
  }
  const due = new Date(`${sweepDueYmd}T00:00:00`);
  const today = sweepNow();
  const diff = diffCalendarDays(new Date(due), new Date(today));
  const dateLabel = formatDate(sweepDueYmd);

  if (diff <= 1) {
    const left = Math.max(0, diff);
    return {
      variant: "urgent",
      text: `預計 ${dateLabel} 自動出貨 · 還剩 ${left} 工作天`,
    };
  }
  return {
    variant: "normal",
    text: `預計 ${dateLabel} 自動出貨`,
  };
}

export const SHELVED_GROUPS: ConsolidationGroup[] = [
  {
    gid: "CG-0521-001",
    recipient: "陳大文 · 台北市信義區",
    carrier: "黑貓宅急便",
    total: 5,
    shelved: 5,
    oldestYmd: "05/19",
    sweepDueYmd: "2026-05-20",
    items: [
      { id: "SH-0521-0040", items: "相機配件 ×1", price: "¥4,800", vol: "中", time: "05/19 14:22" },
      { id: "SH-0521-0041", items: "服飾 ×3",     price: "¥9,800", vol: "中", time: "05/19 14:25" },
      { id: "SH-0521-0042", items: "無線耳機 ×2", price: "¥4,200", vol: "小", time: "05/19 14:30" },
      { id: "SH-0521-0044", items: "保健品 ×1",   price: "¥2,600", vol: "小", time: "05/19 15:10" },
      { id: "SH-0521-0045", items: "服飾 ×1",     price: "¥3,200", vol: "小", time: "05/19 15:15" },
    ],
  },
  {
    gid: "CG-0521-002",
    recipient: "李小薇 · 香港九龍灣",
    carrier: "順豐速運",
    total: 4,
    shelved: 2,
    // sweepDueYmd undefined → SLA idle (group 尚未到齊)
    items: [
      { id: "SH-0521-0048", items: "美妝 ×4",     price: "¥12,400", vol: "中", time: "05/20 10:05" },
      { id: "SH-0521-0049", items: "電動牙刷 ×2", price: "¥3,600",  vol: "小", time: "05/20 11:20" },
      { id: "SH-0521-0050", items: "連身裙 ×1",   price: "¥5,400",  notArrived: true },
      { id: "SH-0521-0051", items: "保健品 ×2",   price: "¥5,200",  notArrived: true },
    ],
  },
];

export interface ManualPendingRow {
  id: string;
  items: string;
  price: string;
  recipient: string;
  time: string;
}

export const MANUAL_PENDING: ManualPendingRow[] = [
  { id: "SH-0521-0052", items: "電子產品 ×2", price: "¥8,400", recipient: "王俊明 / 台中", time: "05/20 09:50" },
  { id: "SH-0521-0053", items: "書籍 ×6",     price: "¥6,200", recipient: "王俊明 / 台中", time: "05/20 10:14" },
  { id: "SH-0521-0055", items: "服飾 ×2",     price: "¥4,800", recipient: "未設定",       time: "05/20 13:02" },
];

/* ============================================================
 * Stage 3 — 等待併箱（outbound-grouped expandable）
 * ==========================================================*/
export interface ConsolidateOutboundChild {
  id: string;
  items: string;
  price: string;
  time: string;
}

export interface ConsolidateOutbound {
  obid: string;
  total: number;
  value: string;
  recipient: string;
  carrier: string;
  sub: "not_picked" | "picked";
  subLabel: string;
  subVariant: ShipmentChipVariant;
  time: string;
  children: ConsolidateOutboundChild[];
}

export const CONSOLIDATE_OUTBOUNDS: ConsolidateOutbound[] = [
  {
    obid: "OB-0521-001", total: 3, value: "¥18,800",
    recipient: "陳大文 · 台北", carrier: "黑貓宅急便",
    sub: "not_picked", subLabel: "未揀貨", subVariant: "warn",
    time: "05/21 18:00",
    children: [
      { id: "SH-0521-0040", items: "相機配件 ×1", price: "¥4,800", time: "05/19 14:22" },
      { id: "SH-0521-0041", items: "服飾 ×3",     price: "¥9,800", time: "05/19 14:25" },
      { id: "SH-0521-0042", items: "無線耳機 ×2", price: "¥4,200", time: "05/19 14:30" },
    ],
  },
  {
    obid: "OB-0521-002", total: 2, value: "¥7,800",
    recipient: "李小薇 · 香港", carrier: "順豐速運",
    sub: "picked", subLabel: "已揀貨", subVariant: "ok",
    time: "05/21 17:00",
    children: [
      { id: "SH-0518-0021", items: "保健品 ×3", price: "¥5,400", time: "05/19 09:10" },
      { id: "SH-0518-0022", items: "美妝 ×1",   price: "¥2,400", time: "05/19 10:30" },
    ],
  },
  {
    obid: "OB-0521-003", total: 4, value: "¥15,400",
    recipient: "陳大文 · 台北", carrier: "黑貓宅急便",
    sub: "not_picked", subLabel: "未揀貨", subVariant: "warn",
    time: "05/22 14:00",
    children: [
      { id: "SH-0520-0010", items: "電子產品 ×2", price: "¥6,200", time: "05/20 11:14" },
      { id: "SH-0520-0011", items: "書籍 ×4",     price: "¥4,200", time: "05/20 11:20" },
      { id: "SH-0520-0012", items: "服飾 ×2",     price: "¥3,000", time: "05/20 13:50" },
      { id: "SH-0520-0013", items: "配件 ×1",     price: "¥2,000", time: "05/20 14:00" },
    ],
  },
];

/* ============================================================
 * Stage 4 / 5 — Outbound + Box sub-cards
 * ==========================================================*/
export interface BoxItem {
  id: string;
  items: string;
  price: string;
}

export interface Box {
  bid: string;
  dim: string;
  weight: string;
  items: BoxItem[];
}

export interface OutboundCard {
  obid: string;
  recipient: string;
  carrier: string;
  chips: { label: string; variant: ShipmentChipVariant }[];
  totalWeight: string;
  boxCount: number;
  boxes: Box[];
  pickupAt?: string; // for stage 5
}

export const CONSOLIDATED_OUTBOUNDS: OutboundCard[] = [
  {
    obid: "OB-0521-001", recipient: "陳大文 · 台北", carrier: "黑貓宅急便",
    chips: [
      { label: "已秤重", variant: "ok" },
      { label: "已生成運單", variant: "ok" },
    ],
    totalWeight: "2.60 kg", boxCount: 2,
    boxes: [
      { bid: "BX-001", dim: "35×25×20 cm", weight: "2.10 kg", items: [
        { id: "SH-0521-0040", items: "相機配件 ×1", price: "¥4,800" },
        { id: "SH-0521-0041", items: "服飾 ×3",     price: "¥9,800" },
      ]},
      { bid: "BX-002", dim: "20×15×10 cm", weight: "0.50 kg", items: [
        { id: "SH-0521-0042", items: "無線耳機 ×2", price: "¥4,200" },
      ]},
    ],
  },
  {
    obid: "OB-0521-002", recipient: "李小薇 · 香港", carrier: "順豐速運",
    chips: [
      { label: "已秤重", variant: "ok" },
      { label: "等待運單生成", variant: "info" },
    ],
    totalWeight: "1.20 kg", boxCount: 1,
    boxes: [
      { bid: "BX-003", dim: "25×20×15 cm", weight: "1.20 kg", items: [
        { id: "SH-0518-0021", items: "保健品 ×3", price: "¥5,400" },
        { id: "SH-0518-0022", items: "美妝 ×1",   price: "¥2,400" },
      ]},
    ],
  },
  {
    obid: "OB-0521-004", recipient: "陳大文 · 台北", carrier: "黑貓宅急便",
    chips: [{ label: "等待運單生成", variant: "info" }],
    totalWeight: "4.20 kg", boxCount: 2,
    boxes: [
      { bid: "BX-004", dim: "40×30×20 cm", weight: "3.10 kg", items: [
        { id: "SH-0520-0010", items: "電子產品 ×2", price: "¥6,200" },
        { id: "SH-0520-0011", items: "書籍 ×4",     price: "¥4,200" },
      ]},
      { bid: "BX-005", dim: "22×18×12 cm", weight: "1.10 kg", items: [
        { id: "SH-0520-0013", items: "配件 ×1", price: "¥2,000" },
      ]},
    ],
  },
];

export const DISPATCH_READY: OutboundCard[] = [
  {
    obid: "OB-0521-001", recipient: "陳大文 · 台北", carrier: "黑貓宅急便",
    pickupAt: "明日 09:00",
    chips: [{ label: "準備好", variant: "ok" }],
    totalWeight: "2.60 kg", boxCount: 2,
    boxes: [
      { bid: "BX-001", dim: "35×25×20 cm", weight: "2.10 kg", items: [
        { id: "SH-0521-0040", items: "相機配件 ×1", price: "¥4,800" },
        { id: "SH-0521-0041", items: "服飾 ×3",     price: "¥9,800" },
      ]},
      { bid: "BX-002", dim: "20×15×10 cm", weight: "0.50 kg", items: [
        { id: "SH-0521-0042", items: "無線耳機 ×2", price: "¥4,200" },
      ]},
    ],
  },
];

/* ============================================================
 * Stage 6 — 已出倉 (flat table)
 * ==========================================================*/
export interface DispatchedRow {
  obid: string;
  cb: string; // 件 / 箱 summary
  value: string;
  recipient: string;
  carrier: string;
  time: string;
}

export const DISPATCHED_ROWS: DispatchedRow[] = [
  { obid: "OB-0521-008", cb: "3 件 / 2 箱", value: "¥18,800", recipient: "陳大文 · 台北", carrier: "黑貓宅急便",  time: "05/22 09:30" },
  { obid: "OB-0520-998", cb: "2 件 / 1 箱", value: "¥7,800",  recipient: "李小薇 · 香港", carrier: "順豐速運",     time: "05/21 14:15" },
  { obid: "OB-0520-997", cb: "1 件 / 1 箱", value: "¥3,400",  recipient: "王俊明 · 台中", carrier: "日本郵便 EMS", time: "05/21 11:00" },
  { obid: "OB-0519-996", cb: "4 件 / 2 箱", value: "¥22,100", recipient: "陳大文 · 台北", carrier: "黑貓宅急便",  time: "05/20 10:45" },
  { obid: "OB-0518-995", cb: "2 件 / 1 箱", value: "¥5,400",  recipient: "李小薇 · 香港", carrier: "順豐速運",     time: "05/19 16:20" },
];

/* ============================================================
 * Pipeline configuration (top-level)
 * ==========================================================*/
export const STAGES: ShipmentStage[] = [
  { key: "waiting_inbound",     label: "等待入庫", count: 12, sub: "+3 今日" },
  { key: "shelved",             label: "已上架",   count: 8,  sub: "2 件可併" },
  { key: "waiting_consolidate", label: "等待併箱", count: 5,  sub: "2 已揀 / 3 未揀" },
  { key: "consolidated",        label: "已集箱",   count: 3,  sub: "取運單中" },
  { key: "waiting_dispatch",    label: "待出倉",   count: 1,  sub: "明日攬收" },
  { key: "dispatched",          label: "已出倉",   count: 0,  sub: "本月 24", zero: true },
];

export const STAGE_META: Record<
  ShipmentStageKey,
  { title: string; hint: string }
> = {
  waiting_inbound:     { title: "等待入庫",     hint: "已預報入庫單；可改寄送方式或取消預報" },
  shelved:             { title: "已上架",       hint: "客戶介入點：託管中 group 或 待手動建單" },
  waiting_consolidate: { title: "等待併箱",     hint: "已生成出庫單，倉庫揀貨中（無客戶介入）" },
  consolidated:        { title: "已集箱",       hint: "集箱完成 · 等秤重 / 運單（無客戶介入）" },
  waiting_dispatch:    { title: "待出倉",       hint: "運單已生成 · 等貨運攬收（無客戶介入）" },
  dispatched:          { title: "已出倉",       hint: "已完成總覽（近 30 天）" },
};

/* ============================================================
 * Detail Sheet — minimal mock for any row in any stage
 * ==========================================================*/
const buildTimeline = (current: number): TimelineRow[] => {
  const labels = [
    { label: "預報已建立", note: "客戶提交" },
    { label: "到達倉庫", note: "倉庫掃碼" },
    { label: "上架完成", note: "已分配儲位" },
    { label: "等待併箱", note: "符合併單規則" },
    { label: "已集箱", note: "倉庫拼櫃" },
    { label: "已秤重 & 取運單", note: "Carrier 系統回傳" },
    { label: "出倉", note: "已交付 Carrier" },
  ];
  return labels.map((row, idx) => ({
    label: row.label,
    note: row.note,
    time:
      idx < current
        ? `05-${10 + idx} 14:${20 + idx * 3}`
        : idx === current
        ? "處理中"
        : undefined,
    state: idx < current ? "done" : idx === current ? "current" : "upcoming",
  }));
};

export const buildDetailTimeline = buildTimeline;

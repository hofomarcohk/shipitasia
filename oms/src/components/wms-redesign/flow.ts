// P17 — handoff outbound-flow graph used by NextCTA + Stepper.
//
// Mirrors wms-app.jsx#FLOW. Keys map to sidebar route slugs (also the
// segment under /wms/operations/ for shipping pages). Adding a page:
// give it a `next` (or null for end-of-flow) and a human label.

export type FlowPageId =
  | "home"
  | "queue"
  | "outbound"
  | "arrive"
  | "putaway"
  | "pick"
  | "pack"
  | "weigh"
  | "print"
  | "depart"
  | "unclaimed"
  | "courier"
  | "topup"
  | "settings";

export interface FlowEntry {
  next: FlowPageId | null;
  label: string | null;
  /** Path to navigate to when CTA fires. zh-hk locale-prefixed. */
  url: string;
}

export const FLOW: Record<FlowPageId, FlowEntry> = {
  // Outbound chain
  pick: {
    next: "pack",
    label: "裝箱任務",
    url: "/zh-hk/wms/operations/pack",
  },
  pack: {
    next: "weigh",
    label: "秤重取單",
    url: "/zh-hk/wms/operations/weigh",
  },
  weigh: {
    next: "depart",
    label: "離站掃描",
    url: "/zh-hk/wms/operations/depart",
  },
  print: {
    next: "depart",
    label: "離站掃描",
    url: "/zh-hk/wms/operations/depart",
  },
  depart: {
    next: null,
    label: null,
    url: "/zh-hk/wms/operations/depart",
  },
  // Inbound chain
  arrive: {
    next: "putaway",
    label: "上架管理",
    url: "/zh-hk/wms/operations/receive",
  },
  putaway: {
    next: "pick",
    label: "建立揀貨批次",
    url: "/zh-hk/wms/operations/pick-batch",
  },
  // Top-level + branches
  home: { next: null, label: null, url: "/zh-hk/wms" },
  queue: { next: null, label: null, url: "/zh-hk/wms/queue" },
  outbound: {
    next: "pick",
    label: "建揀貨批次",
    url: "/zh-hk/wms/operations/outbound-list",
  },
  unclaimed: {
    next: null,
    label: null,
    url: "/zh-hk/wms/operations/unclaimed-inbounds",
  },
  courier: { next: null, label: null, url: "/zh-hk/wms/admin/carrier-accounts" },
  topup: { next: null, label: null, url: "/zh-hk/wms/admin/topup-requests" },
  settings: { next: null, label: null, url: "/zh-hk/wms/admin/settings" },
};

export const SHIPPING_STEPS: { id: FlowPageId; label: string }[] = [
  { id: "pick", label: "揀貨" },
  { id: "pack", label: "裝箱" },
  { id: "weigh", label: "秤重取單" },
  { id: "print", label: "印單" },
  { id: "depart", label: "離站" },
];

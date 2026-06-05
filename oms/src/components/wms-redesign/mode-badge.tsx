// P17 — Mode badge for pack/print/depart. 3 colour-coded variants
// signal the parcel's shipping mode at a glance:
//   集運 (consolidated)  → info blue
//   單發 (single_direct) → ok green
//   YT                   → purple
// Falls through to a muted pill for unknown modes (e.g. unclaimed).

import { Pill } from "./pill";

export type Mode = "consolidated" | "single" | "yt";

const COPY: Record<Mode, { kind: Parameters<typeof Pill>[0]["kind"]; label: string }> = {
  consolidated: { kind: "info", label: "集運" },
  single: { kind: "warn", label: "單發" },
  yt: { kind: "ok", label: "YT 件" },
};

export function ModeBadge({ mode }: { mode: Mode | string }) {
  const c = COPY[mode as Mode] ?? { kind: "muted" as const, label: mode };
  return <Pill kind={c.kind}>{c.label}</Pill>;
}

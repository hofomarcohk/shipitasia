// W6 — Pill status chip (Direction A 工場日勤).
//
// Squared 2px corners, 700 weight. Solid fills for primary semantics
// (ok / warn / danger / brand), soft fills for secondary readings
// (ok-soft / warn-soft / info). `ok-soft` renders mono — it is the
// status-machine-value chip (e.g. label_printed).

import { cn } from "@/lib/utils";
import * as React from "react";

const KIND = {
  ok: "bg-wms-ok text-white",
  "ok-soft": "bg-wms-ok-bg text-wms-ok-fg font-wms-mono font-semibold",
  warn: "bg-wms-warn text-white",
  "warn-soft": "bg-wms-warn-bg text-wms-warn-fg",
  danger: "bg-wms-danger text-white",
  info: "bg-wms-info-bg text-wms-info-fg",
  purple: "bg-wms-purple-bg text-wms-purple-fg",
  brand: "bg-wms-brand text-white",
  muted: "bg-wms-surface-alt text-wms-muted border border-wms-border",
  ink: "bg-wms-ink text-white",
} as const;

export type PillKind = keyof typeof KIND;

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  kind?: PillKind;
}

export function Pill({
  kind = "muted",
  className,
  ...rest
}: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[2px] px-2 py-[2px]",
        "text-[11.5px] font-bold leading-[1.4] tracking-[0.02em] whitespace-nowrap",
        "border border-transparent",
        KIND[kind],
        className
      )}
      {...rest}
    />
  );
}

// P17 — Pill component (status chip).
//
// Maps the handoff `Pill` element to a Tailwind-driven span with
// 8 colour variants. Used everywhere status / mode / count is
// rendered inline.

import { cn } from "@/lib/utils";
import * as React from "react";

const KIND = {
  ok: "bg-wms-ok-bg text-wms-ok-fg",
  warn: "bg-wms-warn-bg text-wms-warn-fg",
  danger: "bg-wms-danger-bg text-wms-danger-fg",
  info: "bg-wms-info-bg text-wms-info-fg",
  purple: "bg-wms-purple-bg text-wms-purple-fg",
  brand: "bg-wms-brand-soft text-wms-brand",
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
        "inline-flex items-center gap-1 rounded-full px-2 py-[2px]",
        "text-[11.5px] font-medium leading-[1.4] whitespace-nowrap",
        "border border-transparent",
        KIND[kind],
        className
      )}
      {...rest}
    />
  );
}

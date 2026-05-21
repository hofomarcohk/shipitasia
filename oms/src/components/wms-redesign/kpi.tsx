// P17 — KPI card. Big mono number + label + optional icon + delta.
// Sized so 4-5 fit in the home page's horizontal strip at 1440px.

import { cn } from "@/lib/utils";
import * as React from "react";

export interface KpiProps {
  n: React.ReactNode;
  lbl: React.ReactNode;
  icon?: React.ReactNode;
  delta?: React.ReactNode;
  deltaKind?: "up" | "down";
  sub?: React.ReactNode;
  className?: string;
}

export function Kpi({
  n,
  lbl,
  icon,
  delta,
  deltaKind = "up",
  sub,
  className,
}: KpiProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-1.5 rounded-xl border border-wms-border bg-wms-surface px-4 py-3.5",
        className
      )}
    >
      <div className="flex items-start justify-between">
        {icon && (
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-wms-border bg-wms-surface-alt text-wms-ink-2"
          >
            {icon}
          </span>
        )}
        {delta && (
          <span
            className={cn(
              "font-wms-mono text-xs font-medium",
              deltaKind === "up" ? "text-wms-ok-fg" : "text-wms-danger-fg"
            )}
          >
            {delta}
          </span>
        )}
      </div>
      <div className="font-wms-mono text-[26px] font-semibold leading-none tracking-[-0.02em]">
        {n}
      </div>
      <div className="text-[12.5px] text-wms-muted">{lbl}</div>
      {sub && (
        <div className="-mt-0.5 text-[11.5px] text-wms-faint">{sub}</div>
      )}
    </div>
  );
}

// W6 — KPI card (Direction A). White face, icon + label top row,
// 34px mono number + unit, hint line. `active` (count > 0) gets a
// 1.5px ink border + 4px safety-yellow left bar; `tone="danger"`
// flips number/icon/bar to red. Whole card is clickable when the
// caller wraps it / passes onClick via className container.

import { cn } from "@/lib/utils";
import * as React from "react";

export interface KpiProps {
  n: React.ReactNode;
  lbl: React.ReactNode;
  icon?: React.ReactNode;
  unit?: React.ReactNode;
  delta?: React.ReactNode;
  deltaKind?: "up" | "down";
  sub?: React.ReactNode;
  /** Highlight as "has work": ink border + yellow left bar. */
  active?: boolean;
  tone?: "danger";
  className?: string;
}

export function Kpi({
  n,
  lbl,
  icon,
  unit,
  delta,
  deltaKind = "up",
  sub,
  active,
  tone,
  className,
}: KpiProps) {
  const danger = tone === "danger";
  return (
    <div
      className={cn(
        "relative flex flex-1 flex-col gap-1 overflow-hidden rounded-[4px] border bg-wms-surface px-3.5 py-3",
        active
          ? danger
            ? "border-[1.5px] border-wms-danger"
            : "border-[1.5px] border-wms-ink"
          : "border-wms-border",
        className
      )}
    >
      {active && (
        <span
          className={cn(
            "absolute inset-y-0 left-0 w-[4px]",
            danger ? "bg-wms-danger" : "bg-wms-accent"
          )}
        />
      )}
      <div
        className={cn(
          "flex items-center gap-1.5 text-[12.5px] font-semibold",
          danger ? "text-wms-danger" : "text-wms-faint"
        )}
      >
        {icon}
        <span>{lbl}</span>
        {delta && (
          <span
            className={cn(
              "ml-auto font-wms-mono text-xs font-medium",
              deltaKind === "up" ? "text-wms-ok-fg" : "text-wms-danger-fg"
            )}
          >
            {delta}
          </span>
        )}
      </div>
      <div
        className={cn(
          "font-wms-mono text-[34px] font-bold leading-[1.1]",
          danger ? "text-wms-danger" : "text-wms-ink"
        )}
      >
        {n}
        {unit && (
          <span className="ml-1 font-wms text-[13px] font-medium text-wms-faint">
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div className="truncate text-[11.5px] text-wms-faint">{sub}</div>
      )}
    </div>
  );
}

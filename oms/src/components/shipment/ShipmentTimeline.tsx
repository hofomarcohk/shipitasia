"use client";

import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export type TimelineState = "done" | "current" | "upcoming";

export interface TimelineRow {
  label: string;
  note?: string;
  time?: string;
  state: TimelineState;
}

interface ShipmentTimelineProps {
  rows: TimelineRow[];
}

export function ShipmentTimeline({ rows }: ShipmentTimelineProps) {
  return (
    <ol className="relative">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        return (
          <li
            key={`${row.label}-${idx}`}
            className="relative grid grid-cols-[20px_1fr_auto] gap-x-3 pb-5 last:pb-0"
          >
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[9px] top-[22px] bottom-[-6px] w-px border-l border-dashed border-border"
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-1 flex h-[18px] w-[18px] items-center justify-center rounded-full",
                row.state === "done" &&
                  "bg-foreground text-background",
                row.state === "current" &&
                  "bg-[hsl(var(--brand))] text-white shadow-[0_0_0_4px_hsl(var(--brand)/0.18)]",
                row.state === "upcoming" &&
                  "border border-border bg-background"
              )}
            >
              {row.state === "done" && <IconCheck size={11} stroke={3} />}
            </span>
            <div className="min-w-0">
              <div
                className={cn(
                  "text-[13px] font-medium leading-tight",
                  row.state === "upcoming"
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {row.label}
              </div>
              {row.note && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {row.note}
                </div>
              )}
            </div>
            {row.time && (
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {row.time}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

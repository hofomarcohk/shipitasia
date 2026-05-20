"use client";

import { cn } from "@/lib/utils";
import { KeyboardEvent, useRef } from "react";

export type ShipmentStageKey =
  | "waiting_inbound"
  | "shelved"
  | "waiting_consolidate"
  | "consolidated"
  | "waiting_dispatch"
  | "dispatched";

export interface ShipmentStage {
  key: ShipmentStageKey;
  label: string;
  count: number;
  sub?: string;
  zero?: boolean;
}

interface ShipmentPipelineProps {
  stages: ShipmentStage[];
  selected: ShipmentStageKey;
  onChange: (key: ShipmentStageKey) => void;
  orientation?: "horizontal" | "vertical";
}

export function ShipmentPipeline({
  stages,
  selected,
  onChange,
  orientation = "horizontal",
}: ShipmentPipelineProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKey = (e: KeyboardEvent, idx: number) => {
    const isHorizontal = orientation === "horizontal";
    const nextKey = isHorizontal ? "ArrowRight" : "ArrowDown";
    const prevKey = isHorizontal ? "ArrowLeft" : "ArrowUp";
    if (e.key === nextKey && idx < stages.length - 1) {
      e.preventDefault();
      const target = idx + 1;
      onChange(stages[target].key);
      refs.current[target]?.focus();
    } else if (e.key === prevKey && idx > 0) {
      e.preventDefault();
      const target = idx - 1;
      onChange(stages[target].key);
      refs.current[target]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-orientation={orientation}
      className={cn(
        "relative",
        orientation === "horizontal"
          ? "grid gap-2"
          : "flex flex-col gap-3"
      )}
      style={
        orientation === "horizontal"
          ? { gridTemplateColumns: `repeat(${stages.length}, 1fr)` }
          : undefined
      }
    >
      {stages.map((stage, idx) => {
        const isSelected = stage.key === selected;
        const isLast = idx === stages.length - 1;
        return (
          <div
            key={stage.key}
            className={cn(
              "relative flex",
              orientation === "horizontal"
                ? "flex-col items-center"
                : "flex-row items-center gap-3"
            )}
          >
            {/* connector line + chevron */}
            {!isLast && orientation === "horizontal" && (
              <>
                <div
                  className="pointer-events-none absolute left-1/2 top-[22px] h-px w-full border-t border-dashed border-muted-foreground"
                  aria-hidden
                />
                <span
                  className="pointer-events-none absolute left-full top-[22px] z-10 -translate-x-1/2 -translate-y-1/2 select-none bg-background px-1 text-base font-light leading-none text-muted-foreground"
                  aria-hidden
                >
                  ›
                </span>
              </>
            )}
            {!isLast && orientation === "vertical" && (
              <div
                className="pointer-events-none absolute left-[22px] top-[44px] h-full w-px border-l border-dashed border-muted-foreground"
                aria-hidden
              />
            )}
            <button
              ref={(el) => {
                refs.current[idx] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onChange(stage.key)}
              onKeyDown={(e) => handleKey(e, idx)}
              className={cn(
                "relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all",
                isSelected
                  ? "bg-foreground text-background border-foreground shadow-[0_0_0_4px_rgba(0,0,0,0.05)]"
                  : stage.zero || stage.count === 0
                  ? "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                  : "bg-background text-foreground border-border hover:border-foreground/40"
              )}
            >
              {stage.count}
            </button>
            <div
              className={cn(
                "min-w-0",
                orientation === "horizontal"
                  ? "mt-2 text-center"
                  : "flex-1"
              )}
            >
              <div className="text-[13px] font-medium text-foreground">
                {stage.label}
              </div>
              {stage.sub && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {stage.sub}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

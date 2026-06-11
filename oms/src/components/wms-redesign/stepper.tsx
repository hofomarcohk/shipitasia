// W6 — Process stepper (Direction A). Main outbound line is 4 steps:
// 揀貨 → 裝箱 → 秤重取單 → 離站 (印單 is folded into 秤重取單;
// 重印面單 is a recovery branch and stays off the stepper).
// 20px mono circles: done = green soft + ✓, current = brand blue,
// todo = white with grey border. 22px connecting lines, walked
// segments turn green.

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type StepperState = "done" | "current" | "todo";

export interface StepperItem {
  label: string;
  state: StepperState;
}

/** Canonical 4-step outbound chain. Pages pass the current index via
 *  `outboundSteps(n)` so all stepper arrays stay in one place. */
export const OUTBOUND_STEPS = ["揀貨", "裝箱", "秤重取單", "離站"] as const;

export function outboundSteps(current: number): StepperItem[] {
  return OUTBOUND_STEPS.map((label, i) => ({
    label,
    state: i < current ? "done" : i === current ? "current" : "todo",
  }));
}

export function Stepper({
  steps,
  className,
}: {
  steps: StepperItem[];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center", className)}>
      {steps.map((s, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold",
            s.state === "done" && "text-wms-ok-fg",
            s.state === "current" && "text-wms-ink",
            s.state === "todo" && "text-wms-faint",
            i > 0 &&
              "ml-2 before:mr-2 before:block before:h-[1.5px] before:w-[22px] before:bg-wms-border-strong"
          )}
        >
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] font-wms-mono text-[11px]",
              s.state === "done" &&
                "border-wms-ok-fg bg-wms-ok-bg text-wms-ok-fg",
              s.state === "current" &&
                "border-wms-brand bg-wms-brand font-bold text-white",
              s.state === "todo" &&
                "border-wms-border-strong bg-wms-surface text-wms-faint"
            )}
          >
            {s.state === "done" ? <Check size={11} strokeWidth={2.5} /> : i + 1}
          </span>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

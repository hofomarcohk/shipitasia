// P17 — Process stepper. Renders the current pick → pack → weigh →
// print → depart position at the top of each shipping page. State:
// "done" (filled black + tick) / "current" (brand pulse) / "todo".

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type StepperState = "done" | "current" | "todo";

export interface StepperItem {
  label: string;
  state: StepperState;
}

export interface StepperProps {
  steps: StepperItem[];
  className?: string;
}

export function Stepper({ steps, className }: StepperProps) {
  return (
    <div className={cn("flex items-center", className)}>
      {steps.map((s, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-1.5 text-[12.5px]",
            s.state === "done" && "text-wms-ink-2",
            s.state === "current" && "font-semibold text-wms-ink",
            s.state === "todo" && "text-wms-muted",
            i > 0 && "ml-4 before:mr-4 before:block before:h-px before:w-[18px] before:bg-wms-border-strong"
          )}
        >
          <span
            className={cn(
              "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full",
              "border font-wms-mono text-[10.5px]",
              s.state === "done" && "border-wms-ink bg-wms-ink text-white",
              s.state === "current" &&
                "border-wms-brand bg-wms-brand text-white shadow-[0_0_0_4px_rgba(232,240,251,1)]",
              s.state === "todo" &&
                "border-wms-border-strong bg-wms-surface text-wms-muted"
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

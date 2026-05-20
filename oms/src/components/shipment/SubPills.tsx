"use client";

import { cn } from "@/lib/utils";

export interface SubPillOption<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

interface SubPillsProps<T extends string = string> {
  options: SubPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SubPills<T extends string = string>({
  options,
  value,
  onChange,
}: SubPillsProps<T>) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 p-1"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                  isActive
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground"
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

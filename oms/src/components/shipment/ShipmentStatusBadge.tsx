"use client";

import { cn } from "@/lib/utils";

export type ShipmentChipVariant = "warn" | "ok" | "info" | "idle";

const variantClasses: Record<ShipmentChipVariant, string> = {
  warn: "bg-[hsl(var(--chip-warn-bg))] text-[hsl(var(--chip-warn-fg))]",
  ok: "bg-[hsl(var(--chip-ok-bg))] text-[hsl(var(--chip-ok-fg))]",
  info: "bg-[hsl(var(--chip-info-bg))] text-[hsl(var(--chip-info-fg))]",
  idle: "bg-[hsl(var(--chip-idle-bg))] text-[hsl(var(--chip-idle-fg))]",
};

interface ShipmentStatusBadgeProps {
  variant: ShipmentChipVariant;
  children: React.ReactNode;
  className?: string;
}

export function ShipmentStatusBadge({
  variant,
  children,
  className,
}: ShipmentStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

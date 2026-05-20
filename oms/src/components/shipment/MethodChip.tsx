"use client";

import { cn } from "@/lib/utils";
import {
  type DeliveryMethod,
  METHOD_LABEL,
} from "@/lib/shipment-mock";
import { IconLock } from "@tabler/icons-react";

const METHOD_DOT: Record<DeliveryMethod, string> = {
  managed: "bg-[hsl(var(--brand))]",
  direct: "bg-[#B45309]",
  manual: "bg-muted-foreground",
};

interface MethodChipProps {
  method: DeliveryMethod;
  locked?: boolean;
  onClick?: () => void;
}

export function MethodChip({ method, locked, onClick }: MethodChipProps) {
  if (locked) {
    return (
      <span
        title="貨已到倉，無法再改寄送方式"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground"
      >
        <IconLock size={10} />
        {METHOD_LABEL[method]}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-[11.5px] font-medium transition-colors hover:border-foreground/40 hover:bg-muted/40"
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", METHOD_DOT[method])} />
      {METHOD_LABEL[method]}
      <span className="text-muted-foreground">▾</span>
    </button>
  );
}

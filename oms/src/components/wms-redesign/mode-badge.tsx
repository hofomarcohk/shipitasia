// W6 — Mode badge (Direction A). Semantics locked:
//   集運 consolidated → info blue
//   單發 single       → warn orange
//   YT 件             → ok green
// Soft fill + 1.5px solid border in the strong colour, 800 weight.
// Sizes: default / big (14px) / huge (26px — pack hero card).

import { cn } from "@/lib/utils";

export type Mode = "consolidated" | "single" | "yt";

const STYLE: Record<Mode, string> = {
  consolidated: "bg-wms-info-bg text-wms-info-fg border-wms-info-fg",
  single: "bg-wms-warn-bg text-wms-warn-fg border-wms-warn-fg",
  yt: "bg-wms-ok-bg text-wms-ok-fg border-wms-ok-fg",
};

const LABEL: Record<Mode, string> = {
  consolidated: "集運",
  single: "單發",
  yt: "YT 件",
};

export function ModeBadge({
  mode,
  big,
  huge,
  className,
}: {
  mode: Mode | string;
  big?: boolean;
  huge?: boolean;
  className?: string;
}) {
  const known = (mode === "consolidated" || mode === "single" || mode === "yt"
    ? mode
    : null) as Mode | null;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[2px] border-[1.5px] font-extrabold tracking-[0.05em]",
        huge
          ? "px-5 py-2 text-[26px] tracking-[0.08em] border-2"
          : big
            ? "px-3 py-1 text-[14px]"
            : "px-2 py-[2px] text-[11.5px]",
        known
          ? STYLE[known]
          : "border-wms-border bg-wms-surface-alt text-wms-muted",
        className
      )}
    >
      {known ? LABEL[known] : String(mode)}
    </span>
  );
}

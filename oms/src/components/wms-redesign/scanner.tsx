// P17 — Scanner bar. Auto-focused input wrapped with a red blinking
// dot + SCAN label + optional echo chip of the last successful scan.
// Mirrors handoff /wms-shared.jsx Scanner.

"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import * as React from "react";

export interface ScannerProps extends React.HTMLAttributes<HTMLDivElement> {
  placeholder?: string;
  echo?: string | null;
  /**
   * Fires once the user hits Enter (or the scanner injects a CR). The
   * input is cleared right after so the next scan is ready to type.
   */
  onScan?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  inputClassName?: string;
}

export function Scanner({
  placeholder = "掃描貨件 / 貨架 / 訂單條碼…",
  echo,
  onScan,
  autoFocus = true,
  disabled = false,
  className,
  inputClassName,
  ...rest
}: ScannerProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (autoFocus && !disabled) {
      inputRef.current?.focus();
    }
  }, [autoFocus, disabled]);

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-wms-ink bg-wms-surface px-3 py-2 text-[13px]",
        disabled && "opacity-60",
        className
      )}
      {...rest}
    >
      <span
        className="h-[7px] w-[7px] rounded-full bg-wms-danger-fg"
        style={{ animation: disabled ? "none" : "wms-blink 1.4s infinite" }}
      />
      <span className="font-wms-mono text-[11px] font-semibold tracking-[0.04em]">
        SCAN
      </span>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "min-w-0 flex-1 border-0 bg-transparent font-wms-mono text-[13px] text-wms-ink outline-none placeholder:text-wms-faint",
          inputClassName
        )}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const v = (e.target as HTMLInputElement).value.trim();
            if (v && onScan) onScan(v);
            (e.target as HTMLInputElement).value = "";
          }
        }}
      />
      {echo && (
        <span className="inline-flex items-center gap-1 rounded bg-wms-ok-bg px-2 py-[2px] font-wms-mono text-[11.5px] text-wms-ok-fg">
          <Check size={11} strokeWidth={2.5} />
          {echo}
        </span>
      )}
    </div>
  );
}

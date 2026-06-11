// W6 — Scanner bar (Direction A). The protagonist of every operations
// page: 58px tall, white face, 2px signage-black border with a solid
// 4px offset shadow. Red blinking dot + SCAN tag + 16.5px input +
// ↵ Enter keycap. Echo of the last successful scan hangs below the
// bar's right edge in mono green.
//
// Behaviour is unchanged: autofocus, Enter submits + clears.

"use client";

import { cn } from "@/lib/utils";
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
    <div className={cn("relative", echo && "mb-4", className)}>
      <div
        className={cn(
          "flex h-[52px] items-center gap-3 rounded-[3px] border-2 border-wms-ink bg-wms-surface px-4",
          "shadow-[4px_4px_0_rgba(22,24,27,0.16)]",
          disabled && "opacity-60"
        )}
        {...rest}
      >
        <span
          className="h-[10px] w-[10px] flex-none rounded-full bg-wms-danger"
          style={{ animation: disabled ? "none" : "wms-blink 1.6s infinite" }}
        />
        <span className="flex-none font-wms-mono text-[12px] font-bold tracking-[0.22em] text-wms-faint">
          SCAN
        </span>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "min-w-0 flex-1 border-0 bg-transparent font-wms-mono text-[16px] text-wms-ink caret-wms-brand outline-none placeholder:font-wms placeholder:text-[15px] placeholder:text-wms-faint",
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
        <span className="flex-none rounded-[2px] border border-wms-faint px-2 py-[3px] font-wms-mono text-[11.5px] text-wms-faint">
          ↵ Enter
        </span>
      </div>
      {echo && (
        <span className="absolute -bottom-[19px] right-1 font-wms-mono text-[12px] text-wms-ok-fg">
          上次掃描 · {echo} ✓
        </span>
      )}
    </div>
  );
}

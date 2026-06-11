// P17 — sticky bottom NextCTA bar.
//
// Three states drive visual + interaction:
//   locked  — muted small button, no animation, disabled
//   urgent  — amber pulse, attention-grabbing
//   ready   — large brand pulse + Enter-key shortcut + arrow grows
//
// Pages compose by passing `state` + `to` (page id from flow.ts) +
// optional `progress` / hints / back-button / extras.

"use client";

import { ArrowRight, Check, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { cn } from "@/lib/utils";

import { FLOW, type FlowPageId } from "./flow";

export type NextCTAState = "locked" | "urgent" | "ready";

export interface NextCTAProps {
  state?: NextCTAState;
  to: FlowPageId | null;
  /** Override the auto-derived label from FLOW[to].label. */
  label?: string;
  /** Counter (e.g. picked / total) — render mode flips at state=ready. */
  progress?: { done: number; total: number };
  lockedHint?: string;
  urgentHint?: string;
  back?: { url: string; label: string };
  /** Extra nodes injected between progress chip and the main CTA. */
  extras?: React.ReactNode;
  /**
   * 替換預設「下一步 · {label}」單一 CTA。傳入時內置按鈕不再 render，
   * 由 caller 自定（例如同時提供兩條分支讓倉庫員揀）。
   */
  customMainCTA?: React.ReactNode;
  /**
   * True for one render tick right after a locked → ready transition;
   * triggers the celebrate-bounce.
   */
  justFlipped?: boolean;
}

export function NextCTA({
  state = "locked",
  to,
  label,
  progress,
  lockedHint,
  urgentHint,
  back,
  extras,
  customMainCTA,
  justFlipped,
}: NextCTAProps) {
  const router = useRouter();
  const flow = to ? FLOW[to] : null;
  const labelFinal = label ?? flow?.label ?? "下一步";
  const isComplete = state === "ready";
  const isEndOfFlow = !to;

  React.useEffect(() => {
    // 當 caller 自訂 customMainCTA 時，Enter 不再有單一目的地，跳過全局 binding。
    // end-of-flow (to=null) + ready → Enter 返回工作台。
    if (!isComplete || customMainCTA) return;
    const dest = isEndOfFlow ? "/zh-hk/wms" : flow?.url;
    if (!dest) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "Enter") router.push(dest);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isComplete, isEndOfFlow, flow, customMainCTA, router]);

  const handleClick = () => {
    if (state === "locked") return;
    // W5: end-of-flow (to=null) + ready → go back to dashboard
    if (isEndOfFlow && state === "ready") {
      router.push("/zh-hk/wms");
      return;
    }
    if (!flow) return;
    router.push(flow.url);
  };

  // W6 — Direction A: full-width signage-black bar with 3px ink top
  // border. Ready state turns the whole bar into a black→green
  // gradient with a green top border.
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-[5] flex min-h-[64px] items-center gap-3.5 px-[22px] py-3",
        "border-t-[3px] border-wms-ink bg-wms-side-bg",
        state === "ready" &&
          "border-wms-ok-strong bg-[linear-gradient(90deg,#1d1f23_30%,#11532e_100%)]"
      )}
    >
      {back && (
        <button
          className="inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1.5 text-[13px] font-semibold text-wms-side-ink2 hover:text-wms-side-ink"
          onClick={() => router.push(back.url)}
        >
          ← {back.label}
        </button>
      )}

      {progress && (
        <div className="flex items-center gap-2 text-[13.5px] text-wms-side-ink2">
          {isComplete ? (
            <>
              <Check size={14} strokeWidth={2.5} className="text-[#7ce0a6]" />
              <span className="font-wms-mono font-bold text-[#7ce0a6]">
                全部完成
              </span>
              <span>· {progress.total} 件</span>
            </>
          ) : (
            <span className="font-wms-mono font-bold">
              {progress.done}/{progress.total}
            </span>
          )}
        </div>
      )}

      <span className="flex-1" />

      {state === "locked" && lockedHint && (
        <span className="text-[12.5px] text-wms-side-ink3">{lockedHint}</span>
      )}
      {state === "urgent" && urgentHint && (
        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#f5ad42]">
          <Clock size={14} /> {urgentHint}
        </span>
      )}

      {extras}

      {customMainCTA ? (
        customMainCTA
      ) : isEndOfFlow ? (
        <button
          onClick={handleClick}
          className={cn(
            "inline-flex items-center gap-2.5 whitespace-nowrap rounded-[3px] px-6 py-[11px] font-wms-disp text-[15.5px] font-extrabold tracking-[0.02em]",
            state === "ready"
              ? "animate-wms-cta-pulse bg-wms-ok-strong text-white motion-reduce:animate-none"
              : "cursor-not-allowed bg-[#34373c] text-wms-side-ink3"
          )}
        >
          <Check size={15} strokeWidth={2.5} /> {labelFinal ?? "流程完成"}
          {state === "ready" && (
            <span className="rounded-[2px] border border-white/45 bg-white/20 px-[7px] py-[2px] font-wms-mono text-[12px] font-medium">
              ↵
            </span>
          )}
        </button>
      ) : (
        <button
          onClick={handleClick}
          disabled={state === "locked"}
          className={cn(
            "inline-flex items-center gap-2.5 whitespace-nowrap rounded-[3px] font-wms-disp font-extrabold tracking-[0.02em] transition-all",
            state === "locked" &&
              "cursor-not-allowed bg-[#34373c] px-4 py-2.5 text-[13.5px] text-wms-side-ink3",
            state === "urgent" &&
              "animate-wms-cta-urgent bg-wms-warn-fg px-[22px] py-3 text-[15px] text-white motion-reduce:animate-none",
            state === "ready" &&
              "animate-wms-cta-pulse bg-wms-ok-strong px-6 py-[11px] text-[15.5px] text-white hover:brightness-110 motion-reduce:animate-none"
          )}
        >
          <span>下一步 · {labelFinal}</span>
          <ArrowRight
            size={state === "ready" ? 17 : 14}
            strokeWidth={state === "ready" ? 2.5 : 2}
            className={cn(state === "locked" && "opacity-50")}
          />
          {state === "ready" && (
            <span className="rounded-[2px] border border-white/45 bg-white/20 px-[7px] py-[2px] font-wms-mono text-[12px] font-medium">
              ↵
            </span>
          )}
        </button>
      )}
    </div>
  );
}

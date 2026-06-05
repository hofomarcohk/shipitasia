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
   * 替換預設「下一步 · {label}」單一 CTA。傳入時內置按鈕完全唔 render，
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
    // 當 caller 自定 customMainCTA 時，Enter 唔再有單一目的地，跳過全局 binding
    if (!isComplete || isEndOfFlow || !flow || customMainCTA) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "Enter") router.push(flow.url);
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

  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-[5] flex min-h-[68px] items-center gap-3.5 border-t border-wms-border bg-white px-[22px] py-3",
        state === "urgent" &&
          "bg-[linear-gradient(90deg,#FEF3C7_0%,#FFFFFF_40%)]",
        state === "ready" &&
          "bg-[linear-gradient(90deg,#DCFCE7_0%,#FFFFFF_40%)]"
      )}
    >
      {back && (
        <button
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-wms-ink-2 hover:bg-wms-row-hover"
          onClick={() => router.push(back.url)}
        >
          ← {back.label}
        </button>
      )}

      {progress && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-full bg-wms-bg px-3 py-1.5 text-[12.5px] text-wms-muted",
            isComplete && "bg-wms-ok-bg text-wms-ok-fg"
          )}
        >
          {isComplete ? (
            <>
              <Check size={13} strokeWidth={2.5} />
              <span className="font-wms-mono font-semibold text-wms-ok-fg">
                全部完成
              </span>
              · {progress.total} 件
            </>
          ) : (
            <>
              進度{" "}
              <span className="font-wms-mono font-semibold text-wms-ink">
                {progress.done}/{progress.total}
              </span>
            </>
          )}
        </div>
      )}

      {state === "locked" && lockedHint && (
        <span className="text-[12.5px] text-wms-muted">{lockedHint}</span>
      )}
      {state === "urgent" && urgentHint && (
        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-wms-urgent-amber">
          <Clock size={14} /> {urgentHint}
        </span>
      )}

      <span className="flex-1" />

      {extras}

      {customMainCTA ? (
        customMainCTA
      ) : isEndOfFlow ? (
        <button className="inline-flex items-center gap-2 rounded-[10px] border border-wms-ink bg-wms-ink px-4 py-2.5 text-[14px] font-semibold text-white">
          <Check size={14} strokeWidth={2.5} /> 流程結束
        </button>
      ) : (
        <button
          onClick={handleClick}
          disabled={state === "locked"}
          className={cn(
            "inline-flex items-center gap-2.5 whitespace-nowrap rounded-[12px] border border-transparent font-semibold transition-all",
            state === "locked" &&
              "cursor-not-allowed border-wms-border bg-wms-bg px-3.5 py-2 text-[13px] text-wms-faint",
            state === "urgent" &&
              "animate-wms-cta-urgent bg-wms-urgent-amber px-[22px] py-3 text-[15px] text-white shadow-[0_6px_18px_rgba(180,83,9,0.25)]",
            state === "ready" &&
              "animate-wms-cta-pulse bg-wms-brand px-[26px] py-3.5 text-[16px] text-white hover:scale-[1.03] motion-reduce:animate-none"
          )}
        >
          <span>
            下一步 · {labelFinal}
          </span>
          <ArrowRight
            size={state === "ready" ? 18 : 14}
            strokeWidth={state === "ready" ? 2.5 : 2}
            className={cn(state === "locked" && "opacity-50")}
          />
          {state === "ready" && (
            <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 font-wms-mono text-[11px] font-medium">
              ↵
            </span>
          )}
        </button>
      )}
    </div>
  );
}

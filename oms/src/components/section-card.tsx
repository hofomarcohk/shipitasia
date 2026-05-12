"use client";
import React from "react";

/**
 * SectionCard — one unit of the OMS "progressive" flow used on both
 * inbound and outbound new-forms.
 *
 * `status` drives the bubble + border colour only — the body is always
 * rendered. Marco's iteration: customers can keep reviewing prior
 * sections without an ✎ round-trip; the green check on the bubble is the
 * "this is done" signal.
 *
 *   - editing : blue bubble + blue border
 *   - done    : green bubble + green border
 *   - locked  : grey bubble + faded body
 */
export function SectionCard({
  n,
  title,
  status,
  headerActions,
  emphasis,
  children,
}: {
  n: number;
  title: string;
  status: "editing" | "done" | "locked";
  headerActions?: React.ReactNode;
  /** When set, override the editing/done border colour (e.g. "warn" for
   *  the outbound balance-shortfall card). */
  emphasis?: "warn";
  children: React.ReactNode;
}) {
  const locked = status === "locked";
  const done = status === "done";
  const borderClass =
    emphasis === "warn"
      ? "border-amber-300 bg-amber-50/40"
      : done
      ? "border-emerald-300"
      : status === "editing"
      ? "border-blue-300"
      : "border-gray-200";
  const bubbleClass = done
    ? "bg-emerald-500 text-white"
    : emphasis === "warn"
    ? "bg-amber-500 text-white"
    : status === "editing"
    ? "bg-blue-500 text-white"
    : "bg-gray-300 text-gray-600";
  return (
    <div
      className={`border rounded-md ${
        locked ? "opacity-60 bg-gray-50" : "bg-white"
      } ${borderClass}`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${bubbleClass}`}
          >
            {done ? "✓" : n}
          </span>
          <h3 className="text-lg font-semibold">{title}</h3>
          {locked && (
            <span className="text-xs text-gray-500 font-mono">🔒 locked</span>
          )}
        </div>
        {headerActions && (
          <div className="flex items-center gap-2">{headerActions}</div>
        )}
      </div>
      <div className="p-4">
        {locked ? (
          <p className="text-sm text-gray-500">完成上一個 section 後解鎖</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

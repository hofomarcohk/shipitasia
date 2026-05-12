"use client";
import { Button } from "@/components/ui/button";
import React from "react";

/**
 * SectionCard — one unit of the OMS "unlock sections" flow used on both
 * inbound and outbound new-forms.
 *
 * `status` drives presentation:
 *   - editing : full body rendered
 *   - done    : collapsed to KV summary with ✎ edit
 *   - locked  : faded + body hidden, header shows lock pill
 *
 * Hides the ✎ button on the final action section (`hideEditButton`).
 */
export function SectionCard({
  n,
  title,
  status,
  summary,
  onEdit,
  onDone,
  headerActions,
  hideEditButton,
  emphasis,
  children,
}: {
  n: number;
  title: string;
  status: "editing" | "done" | "locked";
  summary: React.ReactNode;
  onEdit: () => void;
  onDone: () => void;
  headerActions?: React.ReactNode;
  hideEditButton?: boolean;
  /** When set, override the editing border colour (e.g. "warn" for the
   *  outbound balance-shortfall card). */
  emphasis?: "warn";
  children: React.ReactNode;
}) {
  const locked = status === "locked";
  const done = status === "done";
  const borderClass =
    status === "editing"
      ? emphasis === "warn"
        ? "border-amber-300 bg-amber-50/40"
        : "border-blue-300"
      : "border-gray-200";
  return (
    <div
      className={`border rounded-md ${
        locked ? "opacity-60 bg-gray-50" : "bg-white"
      } ${borderClass}`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${
              done
                ? "bg-emerald-500 text-white"
                : status === "editing"
                ? emphasis === "warn"
                  ? "bg-amber-500 text-white"
                  : "bg-blue-500 text-white"
                : "bg-gray-300 text-gray-600"
            }`}
          >
            {done ? "✓" : n}
          </span>
          <h3 className="text-lg font-semibold">{title}</h3>
          {locked && (
            <span className="text-xs text-gray-500 font-mono">🔒 locked</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          {done && !hideEditButton && (
            <Button size="sm" variant="ghost" onClick={onEdit}>
              ✎
            </Button>
          )}
          {status === "editing" && summary && !hideEditButton && (
            <Button size="sm" variant="ghost" onClick={onDone}>
              ⌃
            </Button>
          )}
        </div>
      </div>
      <div className="p-4">
        {done ? (
          summary
        ) : locked ? (
          <p className="text-sm text-gray-500">完成上一個 section 後解鎖</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

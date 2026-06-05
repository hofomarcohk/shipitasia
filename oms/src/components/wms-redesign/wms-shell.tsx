// P17 — minimal WMS shell.
//
// The existing PageLayout is built for DataTable / CustomForm config
// flows; the redesigned WMS pages each render bespoke layouts so we
// only need: sidebar + topbar + content area + optional sticky
// NextCTA at the bottom.
//
// The sidebar is the existing AppSidebar (CMS-driven, already gets
// the 4-group restructure from migration P17-003). We just wrap it
// with our own thin topbar.

"use client";

import { Bell, Clock, LogOut } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export interface WmsBreadcrumb {
  label: string;
  href?: string;
}

export interface WmsCutoff {
  /** "14:00" — wall-clock label */
  at: string;
  /** ms remaining; null → hide the strip; <= 0 → render in danger colour */
  countdownMs: number | null;
}

export interface WmsShellProps {
  crumbs?: WmsBreadcrumb[];
  cutoff?: WmsCutoff | null;
  topRight?: React.ReactNode;
  /** Sticky CTA bar rendered at the bottom of the content area. */
  cta?: React.ReactNode;
  children: React.ReactNode;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function WmsShell({
  crumbs = [],
  cutoff,
  topRight,
  cta,
  children,
}: WmsShellProps) {
  // Tick the countdown locally so we don't refetch the dashboard every
  // second. Parent owns the source-of-truth absolute countdown_ms.
  const [now, setNow] = React.useState(() => Date.now());
  const cutoffAtTs = React.useMemo(() => {
    if (!cutoff) return null;
    return Date.now() + cutoff.countdownMs!;
  }, [cutoff]);
  React.useEffect(() => {
    if (cutoff?.countdownMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cutoff?.countdownMs]);

  const remainingMs =
    cutoff && cutoffAtTs != null ? Math.max(0, cutoffAtTs - now) : null;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-wms-bg font-wms text-wms-ink">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-wms-border bg-wms-surface px-4">
          <SidebarTrigger className="-ml-1" />
          {crumbs.length > 0 && (
            <nav className="flex items-center text-[13px] text-wms-muted">
              {crumbs.map((c, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <span className="mx-2 text-wms-faint">/</span>
                  )}
                  <span
                    className={cn(
                      i === crumbs.length - 1 && "font-semibold text-wms-ink"
                    )}
                  >
                    {c.label}
                  </span>
                </React.Fragment>
              ))}
            </nav>
          )}
          <span className="flex-1" />
          {cutoff && remainingMs != null && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]",
                remainingMs > 0
                  ? "bg-wms-warn-bg text-wms-warn-fg"
                  : "bg-wms-danger-bg text-wms-danger-fg"
              )}
            >
              <Clock size={14} />
              <span>
                下個截單 <span className="font-wms-mono font-semibold">{cutoff.at}</span> · 剩
              </span>
              <span className="font-wms-mono text-[13px] font-bold">
                {formatCountdown(remainingMs)}
              </span>
            </div>
          )}
          {topRight}
          <button
            className="rounded-lg border border-wms-border bg-wms-surface p-1.5 hover:bg-wms-row-hover"
            aria-label="通知"
          >
            <Bell size={15} />
          </button>
          <Link
            href="/zh-hk/logout"
            className="inline-flex items-center gap-1.5 rounded-lg border border-wms-border bg-wms-surface px-2.5 py-1.5 text-[12.5px] text-wms-ink-2 hover:bg-wms-row-hover"
            aria-label="登出"
            title="登出"
          >
            <LogOut size={14} />
            <span>登出</span>
          </Link>
        </header>
        <div
          className="relative flex-1 overflow-auto bg-wms-bg"
          data-wms-scroll
        >
          {/* Bottom padding equal to CTA bar height so content isn't
              hidden behind the sticky CTA. 68px = wms-cta-bar min height. */}
          <div className={cn(cta && "pb-[80px]")}>{children}</div>
          {cta}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

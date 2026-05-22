// P17 — handoff #print page (group-based + bulk pickup action bar).
//
// Consumes GET /api/wms/print/groups + POST /api/wms/outbound/schedule-pickup.
// Each row = 1 (client_id + destination) group. Checkbox enables only
// when status === "printed". Selecting ≥ 1 row reveals the brand-coloured
// action bar; clicking schedules a per-carrier pickup batch.

"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  Printer,
  Truck,
} from "lucide-react";
import * as React from "react";

import { Kpi } from "@/components/wms-redesign/kpi";
import { ModeBadge } from "@/components/wms-redesign/mode-badge";
import { NextCTA } from "@/components/wms-redesign/next-cta";
import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { Stepper } from "@/components/wms-redesign/stepper";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { get_request, post_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";

interface PrintGroup {
  group_key: string;
  client_id: string;
  client_name: string;
  carrier_code: string;
  mode: "consolidated" | "single" | "yt";
  destination: {
    country_code: string;
    city: string;
    address: string;
    postal_code: string | null;
  };
  boxes: {
    box_no: string;
    weight: number;
    tracking_no: string | null;
    label_url: string | null;
    sealed_at: string | null;
    // W4 — populated by /api/wms/print/groups from OUTBOUND_BOX retry
    // counters. Legacy rows surface as 0 / null.
    outbound_id: string;
    label_fetch_attempts: number;
    last_label_fetch_error: string | null;
  }[];
  total_boxes: number;
  total_weight_kg: number;
  status: "ready_to_print" | "printed" | "pickup_scheduled";
  outbound_ids: string[];
  pickup_request_id: string | null;
  pickup_eta: { start: string; end: string } | null;
}

const STEPPER = [
  { label: "揀貨", state: "done" as const },
  { label: "裝箱", state: "done" as const },
  { label: "秤重取單", state: "done" as const },
  { label: "印單 + 安排攬收", state: "current" as const },
  { label: "離站", state: "todo" as const },
];

function StatusPill({ status }: { status: PrintGroup["status"] }) {
  if (status === "ready_to_print") return <Pill kind="warn">等列印</Pill>;
  if (status === "printed") return <Pill kind="ok">已列印 · 可攬收</Pill>;
  return <Pill kind="brand">已安排攬收</Pill>;
}

function formatEta(eta: PrintGroup["pickup_eta"]): string {
  if (!eta) return "";
  const s = new Date(eta.start);
  const e = new Date(eta.end);
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmt(s)}–${fmt(e)}`;
}

export function PrintPageClient() {
  const [groups, setGroups] = React.useState<PrintGroup[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // W4 — outbound_ids currently being retried, so we can disable their
  // retry buttons without locking the rest of the page.
  const [retrying, setRetrying] = React.useState<Set<string>>(new Set());

  const reload = React.useCallback(async () => {
    try {
      const res = await get_request("/api/wms/print/groups");
      const json = await res.json();
      if (json?.status === 200) setGroups(json.data?.groups ?? []);
      else setError(json?.message ?? "Load failed");
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    }
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  React.useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const toggle = (key: string, status: PrintGroup["status"]) => {
    if (status !== "printed") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const printedGroups = groups.filter((g) => g.status === "printed");
  const readyGroups = groups.filter((g) => g.status === "ready_to_print");
  const scheduledGroups = groups.filter((g) => g.status === "pickup_scheduled");
  const totalBoxes = groups.reduce((s, g) => s + g.total_boxes, 0);
  // W4 — count boxes still without a label across all groups so the
  // KPI tile reflects the real number of failed fetches.
  const failedBoxCount = groups.reduce(
    (s, g) => s + g.boxes.filter((b) => b.label_url === null).length,
    0
  );

  const selectedGroups = groups.filter(
    (g) => selected.has(g.group_key) && g.status === "printed"
  );
  const selectedBoxCount = selectedGroups.reduce(
    (s, g) => s + g.total_boxes,
    0
  );

  const schedulePickup = async () => {
    if (selectedGroups.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const outbound_ids = selectedGroups.flatMap((g) => g.outbound_ids);
      const res = await post_request(
        "/api/wms/outbound/schedule-pickup",
        { outbound_ids }
      );
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Schedule failed");
      }
      const breakdown = json?.data?.breakdown ?? [];
      const summary = breakdown
        .map(
          (b: any) =>
            `${b.carrier_code.toUpperCase()} ${b.outbound_count}張`
        )
        .join(" · ");
      setToast(`已 call API 預約攬收 · ${summary}`);
      setSelected(new Set());
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const printGroup = (g: PrintGroup) => {
    // Open existing labels-bundle endpoint in a new tab.
    const url = `/api/wms/outbound/labels-bundle?outbound_ids=${g.outbound_ids.join(",")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // W4 — retry carrier label fetch for the next failed box on a given
  // outbound. Each click drains one failed box; the UI keeps the row
  // visible (with bumped attempt_count) until the user clicks again or
  // reloads. We deliberately don't optimistically clear label_url ===
  // null — backend is the source of truth, we just reload after the
  // call resolves.
  const retryLabelFetch = async (outboundId: string, boxNo: string) => {
    if (retrying.has(outboundId)) return;
    setRetrying((prev) => {
      const next = new Set(prev);
      next.add(outboundId);
      return next;
    });
    setError(null);
    try {
      const res = await post_request(
        `/api/wms/outbound/${outboundId}/retry-label-fetch`,
        {}
      );
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Retry failed");
      }
      const data = json?.data ?? {};
      if (data.status === "success") {
        setToast(`箱 ${boxNo} 取單成功 (嘗試 ${data.attempt_count} 次)`);
      } else if (data.status === "no_failed_boxes") {
        setToast(`箱 ${boxNo} 已經有面單，無需重試`);
      } else {
        setError(
          `箱 ${boxNo} 取單失敗 (嘗試 ${data.attempt_count} 次): ${data.last_fetch_error ?? "未知錯誤"}`
        );
      }
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(outboundId);
        return next;
      });
    }
  };

  const ctaState: "locked" | "ready" | "urgent" =
    readyGroups.length > 0
      ? "locked"
      : printedGroups.length > 0
        ? "urgent"
        : "ready";

  return (
    <WmsShell
      crumbs={[{ label: "出貨作業" }, { label: "印單" }]}
      cta={
        <NextCTA
          state={ctaState}
          to="depart"
          progress={{
            done: scheduledGroups.length,
            total: groups.length,
          }}
          lockedHint={
            readyGroups.length > 0
              ? `仲有 ${readyGroups.length} 組未列印`
              : undefined
          }
          urgentHint={
            printedGroups.length > 0
              ? `${printedGroups.length} 組已印未安排攬收 · 勾選後安排`
              : undefined
          }
          back={{
            url: "/zh-hk/wms/operations/weigh",
            label: "秤重取單",
          }}
        />
      }
    >
      <div className="px-[22px] py-3.5">
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-wms-border bg-wms-surface-alt px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-wms-faint">
            出貨流程
          </span>
          <Stepper steps={STEPPER} />
        </div>

        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">
            印單 · 安排攬收
          </h1>
          <Pill kind="muted">
            {groups.length} 組 · {totalBoxes} 張面單
          </Pill>
          <span className="flex-1" />
          <div className="w-[320px]">
            <Scanner placeholder="掃 pallet barcode 定位組…" />
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-3 py-2 text-sm text-wms-danger-fg">
            {error}
          </div>
        )}

        <div className="mb-3 flex gap-2.5">
          <Kpi
            icon={<Printer size={18} />}
            n={readyGroups.length}
            lbl="等列印 · 組"
            sub={`共 ${readyGroups.reduce((s, g) => s + g.total_boxes, 0)} 張面單`}
          />
          <Kpi
            icon={<Check size={18} />}
            n={printedGroups.length}
            lbl="已印 · 等攬收"
            sub="勾選 → 安排攬收"
          />
          <Kpi
            icon={<Truck size={18} />}
            n={scheduledGroups.length}
            lbl="已安排攬收"
            sub="可進入離站"
          />
          <Kpi
            icon={<AlertTriangle size={18} />}
            n={failedBoxCount}
            lbl="取單失敗"
            sub={failedBoxCount > 0 ? "按組內紅色按鈕重試" : undefined}
          />
        </div>

        {selectedGroups.length > 0 && (
          <div
            className="mb-3 flex items-center gap-3.5 rounded-xl border-[1.5px] border-wms-brand p-3 px-4"
            style={{
              background:
                "linear-gradient(90deg, var(--cta-accent-30) 0%, white 80%)",
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-wms-brand text-white">
              <Truck size={18} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">
                已選 <span className="font-wms-mono">{selectedGroups.length}</span> 組 · 共{" "}
                <span className="font-wms-mono">{selectedBoxCount}</span> 箱
              </div>
              <div className="mt-0.5 text-xs text-wms-muted">
                Click 「安排攬收」即時 call courier API · 系統會按各組 carrier 自動分批
              </div>
            </div>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-md px-3 py-1.5 text-xs hover:bg-white/50"
            >
              清除選擇
            </button>
            <button
              onClick={schedulePickup}
              disabled={busy}
              className="inline-flex animate-wms-cta-pulse items-center gap-2 rounded-[10px] bg-wms-brand px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_12px_var(--cta-accent-30)] disabled:animate-none disabled:opacity-50"
            >
              <Truck size={15} /> 安排攬收 ({selectedGroups.length} 組)
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
          <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
            <h3 className="text-sm font-semibold">今日 · 按組列印</h3>
            <span className="text-[11.5px] text-wms-muted">
              1 組 = 1 客戶同目的地 (YT 共箱 1 組)
            </span>
            <span className="flex-1" />
            {printedGroups.length > 0 && (
              <button
                className="rounded-md border border-wms-border px-2.5 py-1 text-xs hover:bg-wms-row-hover"
                onClick={() =>
                  setSelected(new Set(printedGroups.map((g) => g.group_key)))
                }
              >
                全選已印
              </button>
            )}
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-wms-border bg-wms-surface-alt text-[11.5px] text-wms-muted">
                <th className="w-8 px-3 py-2.5" />
                <th className="px-3 py-2.5 text-left font-medium">模式</th>
                <th className="px-3 py-2.5 text-left font-medium">客戶 · 目的地</th>
                <th className="px-3 py-2.5 text-left font-medium">箱號 ({totalBoxes})</th>
                <th className="px-3 py-2.5 text-left font-medium">總重</th>
                <th className="px-3 py-2.5 text-left font-medium">Carrier</th>
                <th className="px-3 py-2.5 text-left font-medium">狀態</th>
                <th className="px-3 py-2.5 text-left font-medium">動作</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-wms-faint">
                    今日仲未有 group ready 印
                  </td>
                </tr>
              )}
              {groups.map((g) => {
                const isSel = selected.has(g.group_key);
                // W4 — boxes still missing a carrier label after the
                // initial fetch. We show one retry CTA per failed box
                // so staff can drain them individually and see attempt
                // counts grow until the carrier API succeeds.
                const failedBoxes = g.boxes.filter(
                  (b) => b.label_url === null
                );
                return (
                  <tr
                    key={g.group_key}
                    className={cn(
                      "border-b border-wms-border last:border-b-0",
                      isSel && "bg-wms-row-select"
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSel}
                        disabled={g.status !== "printed"}
                        onChange={() => toggle(g.group_key, g.status)}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <ModeBadge mode={g.mode} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold">{g.client_name}</div>
                      <div className="flex items-center gap-1 text-[11.5px] text-wms-muted">
                        <ArrowRight size={10} className="text-wms-faint" />
                        <span>
                          {g.destination.country_code} · {g.destination.city}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-wms-mono text-[13px] font-semibold">
                        {g.total_boxes} 箱
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {g.boxes.slice(0, 4).map((b) => (
                          <span
                            key={b.box_no}
                            className={cn(
                              "rounded border px-1.5 py-px font-wms-mono text-[10px]",
                              g.status === "printed" || g.status === "pickup_scheduled"
                                ? "border-transparent bg-wms-ok-bg text-wms-ok-fg"
                                : "border-wms-border bg-wms-surface-alt text-wms-muted"
                            )}
                          >
                            {b.box_no.replace(/^BX-/, "")}
                          </span>
                        ))}
                        {g.boxes.length > 4 && (
                          <span className="text-[10px] text-wms-faint">
                            +{g.boxes.length - 4}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-wms-mono text-wms-muted">
                      {g.total_weight_kg.toFixed(2)}kg
                    </td>
                    <td className="px-3 py-2.5 font-wms-mono">
                      {g.carrier_code}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={g.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      {/* W4 — retry CTAs for any boxes whose carrier
                          label fetch failed. Shown above the regular
                          print/pickup actions so they're impossible to
                          miss on a stuck group. */}
                      {failedBoxes.length > 0 && (
                        <div className="mb-1.5 flex flex-col gap-1">
                          {failedBoxes.map((b) => {
                            const isBusy = retrying.has(b.outbound_id);
                            return (
                              <button
                                key={`retry-${b.outbound_id}-${b.box_no}`}
                                onClick={() =>
                                  retryLabelFetch(b.outbound_id, b.box_no)
                                }
                                disabled={isBusy}
                                title={
                                  b.last_label_fetch_error ??
                                  "上次取單失敗，按此重試"
                                }
                                className="inline-flex items-center gap-1.5 rounded-md border border-wms-danger-fg/40 bg-wms-danger-bg px-2 py-1 text-xs font-semibold text-wms-danger-fg hover:brightness-95 disabled:opacity-60"
                              >
                                <AlertTriangle size={12} />
                                {isBusy
                                  ? `重試中…`
                                  : `取單失敗，按此重試 ${b.box_no.replace(/^BX-/, "")}`}
                                {b.label_fetch_attempts >= 1 && !isBusy && (
                                  <span className="ml-1 rounded bg-white/60 px-1 font-wms-mono text-[10px]">
                                    {b.label_fetch_attempts}x
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {g.status === "ready_to_print" && (
                        <button
                          onClick={() => printGroup(g)}
                          disabled={failedBoxes.length > 0}
                          title={
                            failedBoxes.length > 0
                              ? "仲有箱未取到面單，先重試再列印"
                              : undefined
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-wms-ink bg-wms-ink px-2.5 py-1.5 text-xs text-white hover:brightness-110 disabled:opacity-50"
                        >
                          <Printer size={12} /> 列印整組 ({g.total_boxes})
                        </button>
                      )}
                      {g.status === "printed" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => printGroup(g)}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-wms-row-hover"
                          >
                            <Printer size={12} /> 重印
                          </button>
                          <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-wms-row-hover">
                            <Download size={12} /> 下載
                          </button>
                        </div>
                      )}
                      {g.status === "pickup_scheduled" && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-wms-brand">
                          <Truck size={13} /> 攬收 {formatEta(g.pickup_eta)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {toast && (
          <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-wms-ink px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
            <Check size={14} className="-mt-px mr-1 inline" strokeWidth={2.5} />
            {toast}
          </div>
        )}
      </div>
    </WmsShell>
  );
}

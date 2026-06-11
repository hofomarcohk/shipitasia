// P17 — handoff #print page (group-based + bulk pickup action bar).
//
// Consumes GET /api/wms/print/groups + POST /api/wms/outbound/schedule-pickup.
// Each row = 1 (client_id + destination) group. Checkbox enables only
// when status === "printed". Selecting ≥ 1 row reveals the brand-coloured
// action bar; clicking schedules a per-carrier pickup batch.
//
// W6 — Direction A「工場日勤」restyle: this is the 重印面單 recovery
// branch — it sits OFF the main 4-step outbound line, so no stepper.
// Failed groups get a red row wash + inset red left bar + solid red
// inline error bar; printed groups show the ok-soft status-machine pill.

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

function StatusPill({ status }: { status: PrintGroup["status"] }) {
  if (status === "ready_to_print") return <Pill kind="warn">等列印</Pill>;
  if (status === "printed") return <Pill kind="ok-soft">label_printed</Pill>;
  return <Pill kind="info">已安排攬收</Pill>;
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
      setToast(`已呼叫 API 預約攬收 · ${summary}`);
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

  // W5 — group-level retry: calls /api/wms/print/retry-group with all
  // outbound_ids in the group. One click retries all failed boxes at once.
  const retryGroup = async (g: PrintGroup) => {
    if (retrying.has(g.group_key)) return;
    setRetrying((prev) => {
      const next = new Set(prev);
      next.add(g.group_key);
      return next;
    });
    setError(null);
    try {
      const res = await post_request("/api/wms/print/retry-group", {
        outbound_ids: g.outbound_ids,
      });
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Retry failed");
      }
      const data = json?.data ?? {};
      if (data.all_success) {
        setToast(`${g.client_name} 全部取單成功 · 可以列印`);
        // Auto-open label PDF
        const url = `/api/wms/outbound/labels-bundle?outbound_ids=${g.outbound_ids.join(",")}`;
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const failed = (data.results ?? []).filter((r: any) => r.status === "failed");
        setError(
          `${g.client_name} 部分取單失敗 (${failed.length} 張): ${failed.map((r: any) => r.error).join("; ")}`
        );
      }
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(g.group_key);
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
      crumbs={[{ label: "出貨作業" }, { label: "重印面單" }]}
      cta={
        <NextCTA
          state={ctaState}
          to="print"
          progress={{
            done: scheduledGroups.length,
            total: groups.length,
          }}
          lockedHint={
            readyGroups.length > 0
              ? `尚有 ${readyGroups.length} 組未列印`
              : undefined
          }
          urgentHint={
            printedGroups.length > 0
              ? `${printedGroups.length} 組已列印未安排攬收 · 勾選後安排`
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
        <div className="mb-3.5 flex items-center gap-3">
          <div>
            <h1 className="font-wms-disp text-[24px] font-extrabold tracking-tight">
              重印面單
            </h1>
            <div className="mt-0.5 text-[12.5px] text-wms-muted">
              失敗恢復頁 — 重試取單、重印、安排攬收（1 組 = 1 客戶同目的地）
            </div>
          </div>
          <Pill kind="muted">
            <span className="font-wms-mono">{groups.length}</span> 組 ·{" "}
            <span className="font-wms-mono">{totalBoxes}</span> 張面單
          </Pill>
          <span className="flex-1" />
          <div className="w-[320px]">
            <Scanner placeholder="掃描 pallet 條碼快速定位…" />
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-[3px] bg-wms-danger px-3 py-2 text-[13px] font-semibold text-white">
            <AlertTriangle size={14} className="-mt-px mr-1.5 inline" />
            {error}
          </div>
        )}

        <div className="mb-3 flex gap-2.5">
          <Kpi
            icon={<Printer size={18} />}
            n={readyGroups.length}
            lbl="等列印 · 組"
            active={readyGroups.length > 0}
            sub={`共 ${readyGroups.reduce((s, g) => s + g.total_boxes, 0)} 張面單`}
          />
          <Kpi
            icon={<Check size={18} />}
            n={printedGroups.length}
            lbl="已列印 · 等攬收"
            active={printedGroups.length > 0}
            sub="勾選 → 安排攬收"
          />
          <Kpi
            icon={<Truck size={18} />}
            n={scheduledGroups.length}
            lbl="已安排攬收"
            active={scheduledGroups.length > 0}
            sub="可進入離站"
          />
          <Kpi
            icon={<AlertTriangle size={18} />}
            n={failedBoxCount}
            lbl="取單失敗"
            tone="danger"
            active={failedBoxCount > 0}
            sub={failedBoxCount > 0 ? "點擊組內紅色按鈕重試" : undefined}
          />
        </div>

        {selectedGroups.length > 0 && (
          <div className="mb-3 flex items-center gap-3.5 rounded-[4px] bg-wms-brand px-4 py-3 text-white">
            <Truck size={18} />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                已選 <span className="font-wms-mono">{selectedGroups.length}</span> 組 · 共{" "}
                <span className="font-wms-mono">{selectedBoxCount}</span> 箱
              </div>
              <div className="mt-0.5 text-xs text-white/80">
                點擊「安排攬收」即時呼叫 courier API · 系統按各組 carrier 自動分批
              </div>
            </div>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-[3px] px-3 py-1.5 text-xs text-white/85 hover:bg-white/10"
            >
              清除選擇
            </button>
            <button
              onClick={schedulePickup}
              disabled={busy}
              className="inline-flex animate-wms-cta-pulse items-center gap-2 rounded-[3px] bg-white px-5 py-2.5 text-sm font-bold text-wms-brand hover:brightness-95 disabled:animate-none disabled:opacity-60 motion-reduce:animate-none"
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
                全選已列印
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
                    今日暫無可列印的組
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
                const isFailed = failedBoxes.length > 0;
                const boxError =
                  failedBoxes.find((b) => b.last_label_fetch_error)
                    ?.last_label_fetch_error ?? null;
                return (
                  <tr
                    key={g.group_key}
                    className={cn(
                      "border-b border-wms-border last:border-b-0",
                      isFailed
                        ? "bg-wms-danger-bg [box-shadow:inset_3px_0_0_#CF3326]"
                        : isSel && "bg-wms-row-select"
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
                            className="rounded-[2px] border border-wms-border bg-wms-surface px-1.5 py-px font-wms-mono text-[12px]"
                          >
                            {b.box_no.replace(/^BX-/, "")}
                          </span>
                        ))}
                        {g.boxes.length > 4 && (
                          <span className="font-wms-mono text-[10px] text-wms-faint">
                            +{g.boxes.length - 4}
                          </span>
                        )}
                      </div>
                      {boxError && (
                        <div className="mt-1.5 rounded-[2px] bg-wms-danger px-2.5 py-1.5 text-[12px] font-semibold text-white">
                          {boxError}
                        </div>
                      )}
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
                      {/* W5 — single group-level retry button when any
                          box is missing a label. Calls /api/wms/print/retry-group
                          with all outbound_ids in this group. */}
                      {failedBoxes.length > 0 && (
                        <div className="mb-1.5">
                          <button
                            onClick={() => retryGroup(g)}
                            disabled={retrying.has(g.group_key)}
                            className="inline-flex items-center gap-1.5 rounded-[3px] bg-wms-danger px-3 py-1.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-60"
                          >
                            <AlertTriangle size={12} />
                            {retrying.has(g.group_key)
                              ? "重新取單中…"
                              : `重新取單 · ${failedBoxes.length} 箱未有面單`}
                          </button>
                        </div>
                      )}
                      {g.status === "ready_to_print" && (
                        <button
                          onClick={() => printGroup(g)}
                          disabled={failedBoxes.length > 0}
                          title={
                            failedBoxes.length > 0
                              ? "尚有箱未取得面單，請先重試再列印"
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
                          <Truck size={13} /> 攬收{" "}
                          <span className="font-wms-mono">
                            {formatEta(g.pickup_eta)}
                          </span>
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
          <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-wms-ink px-4 py-2.5 text-sm font-medium text-white shadow-[3px_3px_0_rgba(22,24,27,0.25)]">
            <Check size={14} className="-mt-px mr-1 inline text-[#7CE0A6]" strokeWidth={2.5} />
            {toast}
          </div>
        )}
      </div>
    </WmsShell>
  );
}

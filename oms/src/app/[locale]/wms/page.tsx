// P17 — WMS home page (handoff #home).
//
// Client-rendered: pulls /api/wms/dashboard once on mount + ticks the
// cutoff countdown locally. Layout: greeting strip + KPI strip + main
// two-column (NOW card + Run Sheet on the left, anomalies + funnel +
// quick-scan on the right).

"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Box,
  Check,
  Clock,
  Flame,
  HelpCircle,
  PackageOpen,
  Scale,
  Truck,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Kpi } from "@/components/wms-redesign/kpi";
import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { get_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";

interface Dashboard {
  kpis: {
    outbound_today: number;
    inbound_today: number;
    unclaimed_pending: number;
    anomalies: number;
    cutoff_countdown_ms: number;
    cutoff_at: string;
  };
  funnel: {
    ready_for_label: number;
    picking: number;
    packing: number;
    weighing: number;
    printing: number;
    ready_to_depart: number;
  };
  now_card: {
    kind:
      | "anomaly"
      | "unclaimed_urgent"
      | "weigh"
      | "print"
      | "pickup"
      | "pick_batch"
      | "idle";
    title: string;
    hint: string;
    count: number;
    action_url: string;
    countdown_ms: number | null;
  };
  run_sheet: {
    time: string;
    title: string;
    flow: "consol" | "yt" | "ops";
    count: number;
    state: "done" | "current" | "todo";
    action_url: string;
  }[];
  anomalies: {
    outbound_id: string;
    client_id: string;
    held_reason: string | null;
    held_detail: string | null;
    held_since: string | null;
  }[];
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

function todayLabel(d: Date): string {
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} 星期${days[d.getDay()]}`;
}

const FLOW_PILL: Record<
  Dashboard["run_sheet"][number]["flow"],
  { kind: Parameters<typeof Pill>[0]["kind"]; label: string } | null
> = {
  consol: { kind: "info", label: "集運" },
  yt: { kind: "purple", label: "YT" },
  ops: null,
};

function RunSheetRow({
  row,
  onClick,
}: {
  row: Dashboard["run_sheet"][number];
  onClick: () => void;
}) {
  const done = row.state === "done";
  const cur = row.state === "current";
  const flowPill = FLOW_PILL[row.flow];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex cursor-pointer items-start gap-3.5 rounded-[10px] border px-3.5 py-3 transition-colors",
        cur
          ? "border-wms-warn-fg/20 bg-[#FEFCE8]"
          : "border-transparent hover:bg-wms-row-hover",
        done && "opacity-60"
      )}
    >
      <div
        className={cn(
          "min-w-[38px] pt-0.5 font-wms-mono text-[11px] font-medium",
          cur ? "text-wms-warn-fg" : "text-wms-muted"
        )}
      >
        {row.time}
      </div>
      <div
        className={cn(
          "flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-[1.5px]",
          done && "border-wms-ok-fg bg-wms-ok-fg text-white",
          cur && "border-wms-warn-fg bg-wms-warn-fg text-white",
          !done && !cur && "border-wms-border-strong bg-white text-wms-faint"
        )}
      >
        {done ? <Check size={13} strokeWidth={2.5} /> : cur ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span
            className={cn(
              "text-[13.5px]",
              cur ? "font-semibold" : "font-medium",
              done && "text-wms-muted line-through",
              !done && !cur && "text-wms-ink"
            )}
          >
            {row.title}
          </span>
          {flowPill && <Pill kind={flowPill.kind}>{flowPill.label}</Pill>}
          {cur && <Pill kind="warn">⬅ 你而家喺度</Pill>}
        </div>
      </div>
      {row.count > 0 && (
        <span
          className={cn(
            "rounded-md px-2 py-0.5 font-wms-mono text-xs font-semibold",
            cur ? "bg-wms-warn-fg text-white" : "border border-wms-border bg-wms-surface-alt text-wms-ink-2"
          )}
        >
          {row.count}
        </span>
      )}
      {!done && <ArrowRight size={15} className="text-wms-faint" />}
    </div>
  );
}

function HomeNowCard({
  data,
  liveCountdown,
}: {
  data: Dashboard["now_card"];
  liveCountdown: number | null;
}) {
  const router = useRouter();
  const cutoffPct =
    liveCountdown != null && liveCountdown > 0
      ? Math.min(100, (liveCountdown / (12 * 3600 * 1000)) * 100)
      : 0;
  return (
    <div
      className="flex items-stretch gap-4 rounded-xl border p-[18px] text-white"
      style={{
        background: "linear-gradient(135deg, #0B0B0F 0%, #1E293B 100%)",
        borderColor: "#0B0B0F",
      }}
    >
      <div className="w-1 flex-none rounded bg-wms-brand" />
      <div className="flex-1">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wider text-[#94A3B8]">
          <Zap size={12} className="text-wms-brand" strokeWidth={2} />
          現在應該做 · NOW
        </div>
        <div className="mb-1 text-2xl font-semibold leading-tight tracking-tight">
          {data.title}
        </div>
        <div className="mb-3.5 text-[13.5px] text-[#CBD5E1]">{data.hint}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(data.action_url)}
            className="inline-flex items-center gap-2 rounded-[10px] border border-wms-brand bg-wms-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            <Zap size={15} /> 立即處理 ({data.count})
          </button>
        </div>
      </div>
      {liveCountdown != null && (
        <div className="flex min-w-[130px] flex-col justify-center rounded-[10px] border border-white/10 bg-white/5 p-3">
          <div className="text-[10.5px] font-medium uppercase tracking-wider text-[#94A3B8]">
            截單倒數
          </div>
          <div className="mt-1 font-wms-mono text-[26px] font-semibold leading-tight">
            {formatCountdown(liveCountdown)}
          </div>
          <div className="mt-0.5 text-[11px] text-[#CBD5E1]">18:00 截單</div>
          <div className="mt-2.5 h-1 overflow-hidden rounded bg-white/10">
            <div
              className="h-full bg-wms-brand transition-all"
              style={{ width: `${cutoffPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const FUNNEL_LABELS: { key: keyof Dashboard["funnel"]; label: string; hot?: boolean }[] = [
  { key: "ready_for_label", label: "待揀貨" },
  { key: "picking", label: "揀貨" },
  { key: "packing", label: "裝箱" },
  { key: "weighing", label: "秤重" },
  { key: "printing", label: "印單" },
  { key: "ready_to_depart", label: "離站", hot: true },
];

function PipelineMini({ funnel }: { funnel: Dashboard["funnel"] }) {
  const max = Math.max(
    1,
    ...FUNNEL_LABELS.map((f) => funnel[f.key])
  );
  return (
    <div className="flex flex-col gap-2">
      {FUNNEL_LABELS.map((f) => {
        const n = funnel[f.key];
        return (
          <div key={f.key} className="flex items-center gap-2.5">
            <span className="min-w-[56px] text-xs text-wms-muted">
              {f.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded bg-wms-surface-alt">
              <div
                className={cn(
                  "h-full rounded transition-all",
                  f.hot ? "bg-wms-warn-fg" : "bg-wms-ink"
                )}
                style={{ width: `${(n / max) * 100}%` }}
              />
            </div>
            <span className="min-w-[26px] text-right font-wms-mono text-xs font-semibold">
              {n}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const ANOMALY_REASON_LABEL: Record<string, string> = {
  insufficient_balance: "餘額不足",
  awaiting_client_input: "等客戶補資料",
  label_failed_retry: "取單失敗待重試",
  carrier_auth_failed: "carrier 認證失敗",
  capacity_violation: "超出 carrier 容量",
  carrier_api_failed: "carrier API 失敗",
};

function AnomalyCard({ a }: { a: Dashboard["anomalies"][number] }) {
  const label = a.held_reason
    ? ANOMALY_REASON_LABEL[a.held_reason] ?? a.held_reason
    : "需檢視";
  return (
    <Link
      href={`/zh-hk/wms/operations/outbound-list?filter=held&id=${a.outbound_id}`}
      className="flex items-start gap-2.5 rounded-[10px] bg-wms-warn-bg p-3 hover:brightness-95"
    >
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-white/60 text-wms-warn-fg">
        <AlertTriangle size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[13px] font-semibold text-wms-warn-fg">
          {a.outbound_id} · {label}
        </div>
        <div className="truncate text-xs text-wms-warn-fg/80">
          {a.held_detail ?? "去頁面查看詳情"}
        </div>
      </div>
      <ArrowRight size={14} className="text-wms-warn-fg" />
    </Link>
  );
}

export default function WmsHomePage() {
  const router = useRouter();
  const [data, setData] = React.useState<Dashboard | null>(null);
  const [loadedAt, setLoadedAt] = React.useState<number>(0);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await get_request("/api/wms/dashboard");
        const json = await res.json();
        if (cancelled) return;
        if (json?.status === 200) {
          setData(json.data);
          setLoadedAt(Date.now());
        } else {
          setError(json?.message ?? "Failed to load");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Local tick-down of the absolute cutoff captured at load.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const liveCutoffMs = React.useMemo(() => {
    if (!data || !loadedAt) return null;
    const drift = now - loadedAt;
    return Math.max(0, data.kpis.cutoff_countdown_ms - drift);
  }, [data, loadedAt, now]);

  const dateLabel = todayLabel(new Date());

  return (
    <WmsShell
      crumbs={[{ label: "工作台" }]}
      cutoff={
        data
          ? {
              at: "18:00",
              countdownMs: liveCutoffMs,
            }
          : null
      }
    >
      <div className="p-[22px]">
        <div className="mb-4 flex items-end gap-3.5">
          <div>
            <h1 className="text-2xl leading-[1.15]">
              早晨, Amy{" "}
              <span className="font-normal text-wms-muted">·</span>{" "}
              <span className="font-normal text-wms-muted">{dateLabel}</span>
            </h1>
            <div className="mt-1 text-[13px] text-wms-muted">
              {data ? (
                <>
                  今日待辦約{" "}
                  <strong className="text-wms-ink">
                    {data.kpis.outbound_today + data.kpis.inbound_today + data.kpis.unclaimed_pending}
                  </strong>{" "}
                  件 · {data.run_sheet.filter((r) => r.state === "done").length} 完成 ·{" "}
                  {data.run_sheet.filter((r) => r.state === "current").length} 進行
                </>
              ) : (
                "正在載入今日任務…"
              )}
            </div>
          </div>
          <span className="flex-1" />
          <div className="w-[280px]">
            <Scanner
              placeholder="掃 / 貼任何 barcode 自動跳對應頁…"
              onScan={(v) => {
                // P17 minimal — TODO route based on prefix/lookup.
                router.push(`/zh-hk/wms/queue?q=${encodeURIComponent(v)}`);
              }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-4 py-3 text-sm text-wms-danger-fg">
            載入失敗：{error}
          </div>
        )}

        {data && (
          <>
            <div className="mb-4 flex gap-3">
              <Kpi
                icon={<Box size={18} />}
                n={data.kpis.outbound_today}
                lbl="今日出貨單"
              />
              <Kpi
                icon={<PackageOpen size={18} />}
                n={data.kpis.inbound_today}
                lbl="今日入庫"
              />
              <Kpi
                icon={<HelpCircle size={18} />}
                n={data.kpis.unclaimed_pending}
                lbl="無頭件池"
              />
              <Kpi
                icon={<AlertTriangle size={18} />}
                n={data.kpis.anomalies}
                lbl="異常待處理"
              />
            </div>

            <div className="flex gap-3.5">
              <div className="flex min-w-0 flex-[1.8] flex-col gap-3.5">
                <HomeNowCard
                  data={data.now_card}
                  liveCountdown={liveCutoffMs}
                />
                <div className="overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
                  <div className="flex items-center gap-2.5 border-b border-wms-border px-4 py-3.5">
                    <h2 className="text-[15px] font-semibold">
                      今日 Run Sheet
                    </h2>
                    <Pill kind="muted">
                      {data.run_sheet.filter((r) => r.state === "done").length} 完成
                      · {data.run_sheet.filter((r) => r.state === "current").length} 進行
                      · {data.run_sheet.filter((r) => r.state === "todo").length} 等
                    </Pill>
                  </div>
                  <div className="p-2.5">
                    {data.run_sheet.map((row, i) => (
                      <RunSheetRow
                        key={i}
                        row={row}
                        onClick={() => router.push(row.action_url)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="rounded-xl border border-wms-border bg-wms-surface p-4">
                  <div className="mb-2.5 flex items-center gap-2">
                    <h3 className="text-sm font-semibold">⚠ 異常 · 要處理</h3>
                    <span className="flex-1" />
                    <Link
                      href="/zh-hk/wms/operations/outbound-list?filter=held"
                      className="rounded-md px-2 py-1 text-xs text-wms-muted hover:bg-wms-row-hover"
                    >
                      全部
                    </Link>
                  </div>
                  <div className="flex flex-col gap-2">
                    {data.anomalies.length === 0 ? (
                      <div className="rounded-md bg-wms-ok-bg px-3 py-2 text-xs text-wms-ok-fg">
                        <Check size={14} className="-mt-0.5 mr-1 inline" />
                        無異常
                      </div>
                    ) : (
                      data.anomalies.map((a) => (
                        <AnomalyCard key={a.outbound_id} a={a} />
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-wms-border bg-wms-surface p-4">
                  <div className="mb-2.5 flex items-center">
                    <h3 className="text-sm font-semibold">出貨漏斗 · 即時</h3>
                    <span className="flex-1" />
                    <span className="text-[11px] text-wms-faint">
                      WIP{" "}
                      {Object.values(data.funnel).reduce((a, b) => a + b, 0)}
                    </span>
                  </div>
                  <PipelineMini funnel={data.funnel} />
                </div>
                <div className="rounded-xl border border-wms-border bg-wms-surface-alt p-4">
                  <div className="mb-2 flex items-center">
                    <h3 className="text-sm font-semibold">快速掃</h3>
                    <span className="flex-1" />
                    <span className="text-[11px] text-wms-faint">
                      掃任何條碼跳對應頁
                    </span>
                  </div>
                  <Scanner
                    placeholder="出庫 / 入庫 / SKU / 貨架 / 板位 / 箱…"
                    onScan={(v) =>
                      router.push(`/zh-hk/wms/queue?q=${encodeURIComponent(v)}`)
                    }
                    autoFocus={false}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </WmsShell>
  );
}

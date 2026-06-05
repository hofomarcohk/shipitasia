// WMS operations dashboard (redesigned home).
//
// A real ops cockpit instead of the old NOW-card / run-sheet layout:
//   1. Headline KPI strip (today in / out / WIP / anomalies)
//   2. 階段看板 — live WIP count per stage, click to jump in
//   3. 出貨吞吐 — today / 7d / 30d throughput table + 7-day trend bars
//   4. 即時漏斗 — where volume sits right now
//   5. 異常佇列 — held / failed-label outbounds needing attention
//
// One fetch (/api/wms/dashboard) hydrates everything; polls every 30s.

"use client";

import {
  AlertTriangle,
  ArrowRight,
  Box,
  Inbox,
  Layers,
  PackageCheck,
  RefreshCw,
  Scale,
  Tag,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { get_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";

type StageTone = "neutral" | "active" | "warn" | "done";

interface StageCard {
  key: string;
  label: string;
  count: number;
  unit: string;
  tone: StageTone;
  action_url: string;
  hint?: string;
}
interface ThroughputMetric {
  key: string;
  label: string;
  unit: string;
  today: number;
  d7: number;
  d30: number;
}
interface TrendDay {
  date: string;
  label: string;
  outbound: number;
  inbound: number;
}
interface FunnelStage {
  key: string;
  label: string;
  count: number;
}
interface AnomalyEntry {
  outbound_id: string;
  client_id: string;
  status: string;
  held_reason: string | null;
  held_detail: string | null;
  held_since: string | null;
}
interface Dashboard {
  headline: {
    inbound_arrived_today: number;
    outbound_departed_today: number;
    wip_total: number;
    anomalies: number;
  };
  stage_board: StageCard[];
  throughput: ThroughputMetric[];
  trend_7d: TrendDay[];
  funnel: FunnelStage[];
  anomalies: AnomalyEntry[];
  generated_at: string;
}

function todayLabel(d: Date): string {
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} 星期${days[d.getDay()]}`;
}

const STAGE_ICON: Record<string, React.ReactNode> = {
  receive: <Inbox size={16} />,
  pick: <Layers size={16} />,
  picking: <PackageCheck size={16} />,
  pack: <Box size={16} />,
  weigh: <Scale size={16} />,
  depart: <Truck size={16} />,
  reprint: <Tag size={16} />,
};

const TONE_STYLES: Record<StageTone, string> = {
  neutral: "border-wms-border bg-wms-surface hover:bg-wms-row-hover",
  active: "border-wms-brand/40 bg-wms-brand-soft hover:brightness-[0.98]",
  warn: "border-wms-danger-fg/40 bg-wms-danger-bg hover:brightness-[0.98]",
  done: "border-wms-ok-fg/30 bg-wms-ok-bg hover:brightness-[0.98]",
};
const TONE_NUM: Record<StageTone, string> = {
  neutral: "text-wms-ink",
  active: "text-wms-brand",
  warn: "text-wms-danger-fg",
  done: "text-wms-ok-fg",
};

const HELD_REASON_LABEL: Record<string, string> = {
  label_failed_retry: "取單失敗",
  carrier_auth_failed: "Carrier 認證失敗",
  carrier_api_failed: "Carrier API 失敗",
  insufficient_balance: "餘額不足",
};

function StageBoard({
  stages,
  onJump,
}: {
  stages: StageCard[];
  onJump: (url: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-2.5">
      {stages.map((s, i) => (
        <React.Fragment key={s.key}>
          <button
            onClick={() => onJump(s.action_url)}
            className={cn(
              "group relative flex flex-col gap-1.5 rounded-xl border-[1.5px] p-3 text-left transition",
              TONE_STYLES[s.tone]
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/70",
                  TONE_NUM[s.tone]
                )}
              >
                {STAGE_ICON[s.key]}
              </span>
              <ArrowRight
                size={13}
                className="text-wms-faint opacity-0 transition group-hover:opacity-100"
              />
            </div>
            <div
              className={cn(
                "font-wms-mono text-[24px] font-semibold leading-none",
                TONE_NUM[s.tone]
              )}
            >
              {s.count}
              <span className="ml-0.5 text-[12px] font-normal text-wms-faint">
                {s.unit}
              </span>
            </div>
            <div className="text-[12.5px] font-medium text-wms-ink">
              {s.label}
            </div>
            {s.hint && (
              <div className="text-[10.5px] text-wms-faint">{s.hint}</div>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function ThroughputTable({ metrics }: { metrics: ThroughputMetric[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-wms-border text-[11.5px] text-wms-muted">
          <th className="px-3 py-2 text-left font-medium">指標</th>
          <th className="px-3 py-2 text-right font-medium">今日</th>
          <th className="px-3 py-2 text-right font-medium">7 日</th>
          <th className="px-3 py-2 text-right font-medium">30 日</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((m) => (
          <tr
            key={m.key}
            className="border-b border-wms-border last:border-b-0"
          >
            <td className="px-3 py-2.5">
              <span className="font-medium text-wms-ink">{m.label}</span>
              <span className="ml-1 text-[11px] text-wms-faint">
                ({m.unit})
              </span>
            </td>
            <td className="px-3 py-2.5 text-right font-wms-mono text-[15px] font-semibold text-wms-ink">
              {m.today}
            </td>
            <td className="px-3 py-2.5 text-right font-wms-mono text-wms-ink-2">
              {m.d7}
            </td>
            <td className="px-3 py-2.5 text-right font-wms-mono text-wms-muted">
              {m.d30}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendBars({ days }: { days: TrendDay[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.outbound, d.inbound)));
  return (
    <div className="flex items-end justify-between gap-2 px-1">
      {days.map((d, i) => {
        const isToday = i === days.length - 1;
        return (
          <div
            key={d.date}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <div className="flex h-[96px] w-full items-end justify-center gap-1">
              <div
                className="w-[42%] rounded-t bg-wms-info-fg/70"
                style={{ height: `${(d.inbound / max) * 100}%` }}
                title={`到倉 ${d.inbound} 件`}
              />
              <div
                className={cn(
                  "w-[42%] rounded-t",
                  isToday ? "bg-wms-brand" : "bg-wms-ok-fg/70"
                )}
                style={{ height: `${(d.outbound / max) * 100}%` }}
                title={`離站 ${d.outbound} 單`}
              />
            </div>
            <div
              className={cn(
                "text-[10.5px] tabular-nums",
                isToday ? "font-semibold text-wms-ink" : "text-wms-faint"
              )}
            >
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Funnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="flex flex-col gap-1.5">
      {stages.map((s) => (
        <div key={s.key} className="flex items-center gap-2.5">
          <div className="w-[68px] flex-none text-right text-[12px] text-wms-muted">
            {s.label}
          </div>
          <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-wms-surface-alt">
            <div
              className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-wms-brand/80 to-wms-brand/50 transition-all"
              style={{ width: `${(s.count / max) * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center px-2.5 font-wms-mono text-[12.5px] font-semibold text-wms-ink">
              {s.count}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function timeSince(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "<1 小時";
  if (h < 24) return `${h} 小時`;
  return `${Math.floor(h / 24)} 日`;
}

export default function WmsHomePage() {
  const router = useRouter();
  const [data, setData] = React.useState<Dashboard | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await get_request("/api/wms/dashboard");
      const json = await res.json();
      if (json?.status === 200) {
        setData(json.data);
        setError(null);
      } else {
        setError(json?.message ?? "Failed to load");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const jump = (url: string) => router.push(url);
  const dateLabel = todayLabel(new Date());

  return (
    <WmsShell crumbs={[{ label: "工作台" }]}>
      <div className="p-[22px]">
        {/* Greeting + scan */}
        <div className="mb-4 flex items-end gap-3.5">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">
              倉庫工作台
            </h1>
            <div className="mt-0.5 text-[13px] text-wms-muted">
              {dateLabel} · 埼玉倉 JP-SAITAMA-01
            </div>
          </div>
          <span className="flex-1" />
          <button
            onClick={load}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-wms-border bg-wms-surface px-3 py-2 text-[12.5px] text-wms-ink-2 hover:bg-wms-row-hover disabled:opacity-60"
          >
            <RefreshCw
              size={14}
              className={cn(refreshing && "animate-spin")}
            />
            刷新
          </button>
          <div className="w-[300px]">
            <Scanner
              placeholder="掃 inbound / outbound barcode…"
              onScan={(v) => {
                const t = v.trim();
                if (t.startsWith("OUT-")) jump("/zh-hk/wms/operations/outbound-list");
                else jump("/zh-hk/wms/operations/receive");
              }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-4 py-3 text-sm text-wms-danger-fg">
            {error}
          </div>
        )}

        {/* Stage board */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">階段看板</h2>
            <span className="text-[12px] text-wms-faint">
              即時在製品 · 點卡片直接入該站
            </span>
          </div>
          {data ? (
            <StageBoard stages={data.stage_board} onJump={jump} />
          ) : (
            <div className="grid grid-cols-7 gap-2.5">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[108px] animate-pulse rounded-xl border border-wms-border bg-wms-surface-alt"
                />
              ))}
            </div>
          )}
        </div>

        {/* Two columns: throughput + trend | funnel + anomalies */}
        <div className="flex gap-4">
          {/* Left */}
          <div className="flex flex-[1.3] flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
              <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
                <PackageCheck size={15} className="text-wms-ink-2" />
                <h3 className="text-sm font-semibold">出貨吞吐</h3>
                <span className="text-[11.5px] text-wms-faint">
                  完成量 · 今日 / 7 日 / 30 日
                </span>
              </div>
              {data ? (
                <ThroughputTable metrics={data.throughput} />
              ) : (
                <div className="h-[180px] animate-pulse bg-wms-surface-alt" />
              )}
            </div>

            <div className="rounded-xl border border-wms-border bg-wms-surface p-3.5">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-semibold">近 7 日趨勢</h3>
                <span className="flex-1" />
                <span className="inline-flex items-center gap-1 text-[11px] text-wms-muted">
                  <span className="h-2.5 w-2.5 rounded-sm bg-wms-info-fg/70" />
                  到倉
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-wms-muted">
                  <span className="h-2.5 w-2.5 rounded-sm bg-wms-ok-fg/70" />
                  離站
                </span>
              </div>
              {data ? (
                <TrendBars days={data.trend_7d} />
              ) : (
                <div className="h-[120px] animate-pulse rounded bg-wms-surface-alt" />
              )}
            </div>
          </div>

          {/* Right */}
          <div className="flex flex-1 flex-col gap-4">
            <div className="rounded-xl border border-wms-border bg-wms-surface p-3.5">
              <div className="mb-3 flex items-center gap-2">
                <Layers size={15} className="text-wms-ink-2" />
                <h3 className="text-sm font-semibold">即時出貨漏斗</h3>
              </div>
              {data ? (
                <Funnel stages={data.funnel} />
              ) : (
                <div className="h-[160px] animate-pulse rounded bg-wms-surface-alt" />
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
              <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
                <AlertTriangle size={15} className="text-wms-danger-fg" />
                <h3 className="text-sm font-semibold">異常佇列</h3>
                {data && data.anomalies.length > 0 && (
                  <Pill kind="danger">{data.anomalies.length}</Pill>
                )}
              </div>
              <div className="flex flex-col">
                {data && data.anomalies.length === 0 && (
                  <div className="px-3.5 py-8 text-center text-[13px] text-wms-faint">
                    冇異常 · 全部單正常流轉
                  </div>
                )}
                {data?.anomalies.map((a) => (
                  <button
                    key={a.outbound_id}
                    onClick={() =>
                      jump("/zh-hk/wms/operations/label-print")
                    }
                    className="flex items-center gap-3 border-b border-wms-border px-3.5 py-2.5 text-left last:border-b-0 hover:bg-wms-row-hover"
                  >
                    <div className="flex-1">
                      <div className="font-wms-mono text-[12.5px] font-semibold">
                        {a.outbound_id}
                      </div>
                      <div className="text-[11.5px] text-wms-muted">
                        {HELD_REASON_LABEL[a.held_reason ?? ""] ??
                          a.held_reason ??
                          a.status}
                      </div>
                    </div>
                    <div className="text-right">
                      <Pill kind="warn">{timeSince(a.held_since)}</Pill>
                    </div>
                    <ArrowRight size={13} className="text-wms-faint" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </WmsShell>
  );
}

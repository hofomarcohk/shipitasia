// P17 — handoff #outbound (所有出庫單).

"use client";

import { ChevronRight, Filter, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { ModeBadge, type Mode } from "@/components/wms-redesign/mode-badge";
import { Pill } from "@/components/wms-redesign/pill";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { get_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";

interface OutboundRow {
  _id: string;
  client_id: string;
  carrier_code: string;
  destination_country: string;
  shipment_type: "single" | "consolidated";
  status: string;
  is_yt?: boolean;
  inbound_count: number;
  actual_weight_kg: number | null;
  updatedAt: string;
}

const TABS = [
  { key: "all", label: "全部", match: () => true },
  { key: "ready_for_label", label: "待揀", match: (s: string) => s === "ready_for_label" },
  { key: "picking", label: "揀貨", match: (s: string) => s === "picking" || s === "picked" },
  { key: "packing", label: "裝箱", match: (s: string) => s === "packing" || s === "packed" },
  { key: "weighing", label: "秤重", match: (s: string) => s === "weighing" || s === "weight_verified" },
  { key: "label", label: "印單", match: (s: string) => s === "label_obtained" || s === "label_printed" },
  { key: "departed", label: "已離站", match: (s: string) => s === "departed" },
  { key: "held", label: "異常", match: (s: string) => s === "held" },
] as const;

const STATUS_PILL: Record<string, { kind: Parameters<typeof Pill>[0]["kind"]; label: string }> = {
  held: { kind: "danger", label: "Hold" },
  ready_for_label: { kind: "muted", label: "待揀" },
  picking: { kind: "info", label: "揀貨中" },
  picked: { kind: "info", label: "已揀" },
  packing: { kind: "warn", label: "裝箱中" },
  packed: { kind: "warn", label: "已裝箱" },
  weighing: { kind: "warn", label: "秤重中" },
  weight_verified: { kind: "info", label: "已驗重" },
  label_obtaining: { kind: "info", label: "取單中" },
  label_obtained: { kind: "info", label: "已取單" },
  label_printed: { kind: "info", label: "已印單" },
  departed: { kind: "ok", label: "已離站" },
  cancelled: { kind: "muted", label: "已取消" },
};

function modeOf(o: OutboundRow): Mode {
  if (o.is_yt) return "yt";
  return o.shipment_type === "single" ? "single" : "consolidated";
}

export function OutboundListPageClient() {
  const router = useRouter();
  const [rows, setRows] = React.useState<OutboundRow[]>([]);
  const [tab, setTab] = React.useState<string>("all");
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await get_request("/api/wms/outbound/list?limit=200");
        const json = await res.json();
        if (cancelled) return;
        if (json?.status === 200) setRows(json.data?.items ?? json.data ?? []);
        else setError(json?.message ?? "Load failed");
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const t of TABS) c[t.key] = rows.filter((r) => t.match(r.status)).length;
    return c;
  }, [rows]);

  const visible = React.useMemo(() => {
    const tabMatch = TABS.find((t) => t.key === tab) ?? TABS[0];
    return rows
      .filter((r) => tabMatch.match(r.status))
      .filter((r) => {
        if (!q.trim()) return true;
        const needle = q.toLowerCase();
        return (
          r._id.toLowerCase().includes(needle) ||
          r.client_id.toLowerCase().includes(needle)
        );
      });
  }, [rows, tab, q]);

  return (
    <WmsShell crumbs={[{ label: "所有出庫單" }]}>
      <div className="px-[22px] py-3.5">
        <div className="mb-3.5 flex items-end gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">所有出庫單</h1>
            <div className="mt-1 text-[13px] text-wms-muted">
              當前 {rows.length} 單 · 包括 OMS 預報未到倉的件
            </div>
          </div>
          <span className="flex-1" />
          <div className="flex w-[280px] items-center gap-2 rounded-lg border border-wms-border bg-wms-surface px-3 py-1.5 text-[13px]">
            <Search size={14} className="text-wms-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋 OB# / 客戶…"
              className="min-w-0 flex-1 border-0 bg-transparent outline-none"
            />
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-wms-border bg-wms-surface px-2.5 py-1.5 text-xs hover:bg-wms-row-hover">
            <Filter size={13} /> 篩選
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-3 py-2 text-sm text-wms-danger-fg">
            {error}
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-1 rounded-[10px] border border-wms-border bg-wms-surface-alt p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-md px-3 py-1 text-[12.5px] font-medium",
                tab === t.key
                  ? "bg-wms-surface text-wms-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  : "text-wms-muted hover:bg-wms-row-hover"
              )}
            >
              {t.label} · {counts[t.key] ?? 0}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-wms-border bg-wms-surface-alt text-[11.5px] text-wms-muted">
                <th className="px-3 py-2.5 text-left font-medium">OB #</th>
                <th className="px-3 py-2.5 text-left font-medium">模式</th>
                <th className="px-3 py-2.5 text-left font-medium">Client</th>
                <th className="px-3 py-2.5 text-left font-medium">件數</th>
                <th className="px-3 py-2.5 text-left font-medium">重量</th>
                <th className="px-3 py-2.5 text-left font-medium">Carrier</th>
                <th className="px-3 py-2.5 text-left font-medium">目的地</th>
                <th className="px-3 py-2.5 text-left font-medium">狀態</th>
                <th className="px-3 py-2.5 text-left font-medium">更新</th>
                <th className="w-8 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-wms-faint">
                    無符合條件的出庫單
                  </td>
                </tr>
              )}
              {visible.map((o) => {
                const sp = STATUS_PILL[o.status] ?? { kind: "muted" as const, label: o.status };
                return (
                  <tr
                    key={o._id}
                    onClick={() =>
                      router.push(`/zh-hk/outbound/${o._id}`)
                    }
                    className="cursor-pointer border-b border-wms-border last:border-b-0 hover:bg-wms-row-hover"
                  >
                    <td className="px-3 py-2.5 font-wms-mono font-semibold">
                      {o._id}
                    </td>
                    <td className="px-3 py-2.5">
                      <ModeBadge mode={modeOf(o)} />
                    </td>
                    <td className="px-3 py-2.5 font-medium">
                      {o.client_id.slice(-6).toUpperCase()}
                    </td>
                    <td className="px-3 py-2.5 font-wms-mono">{o.inbound_count}</td>
                    <td className="px-3 py-2.5 font-wms-mono">
                      {o.actual_weight_kg != null
                        ? `${o.actual_weight_kg.toFixed(2)}kg`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-wms-mono text-wms-muted">
                      {o.carrier_code}
                    </td>
                    <td className="px-3 py-2.5 font-wms-mono text-wms-muted">
                      {o.destination_country}
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill kind={sp.kind}>{sp.label}</Pill>
                    </td>
                    <td className="px-3 py-2.5 font-wms-mono text-[11px] text-wms-faint">
                      {o.updatedAt
                        ? new Date(o.updatedAt).toLocaleTimeString("zh-HK", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-wms-faint">
                      <ChevronRight size={14} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </WmsShell>
  );
}

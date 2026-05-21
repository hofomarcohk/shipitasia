// P17 — handoff #unclaimed page (CS matching + 30-day countdown).
//
// Right-side MatchPanel uses /api/wms/unclaimed/{id}/match-existing
// which now returns confidence_score (P17 F.1).

"use client";

import {
  AlertTriangle,
  Check,
  Clock,
  Filter,
  Flame,
  HelpCircle,
  User,
  X,
} from "lucide-react";
import * as React from "react";

import { Kpi } from "@/components/wms-redesign/kpi";
import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { get_request, post_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";

interface UnclaimedRow {
  _id: string;
  tracking_no: string;
  carrier_inbound_code: string | null;
  weight: number | null;
  dimension: { length: number; width: number; height: number } | null;
  staff_note: string | null;
  status: "pending_assignment" | "assigned" | "disposed";
  assigned_to_client_id: string | null;
  assigned_to_inbound_id: string | null;
  warehouseCode: string;
  arrived_at: string;
  warning_stages?: { stage: string; sent_at: string }[];
  abandoned_at?: string | null;
  locationCode?: string | null;
}

interface MatchCandidate {
  _id: string;
  client_id: string;
  tracking_no: string;
  carrier_inbound_code: string;
  shipping_mode: string;
  declared_items_count: number;
  createdAt: string;
  confidence_score?: number;
  confidence_reasons?: string[];
}

function daysUntilAbandon(arrivedAtStr: string): number {
  const arrived = new Date(arrivedAtStr).getTime();
  const elapsed = Math.floor((Date.now() - arrived) / 86_400_000);
  return 30 - elapsed;
}

function CountdownPill({ days }: { days: number }) {
  if (days <= 0) return <Pill kind="muted">已過期</Pill>;
  if (days <= 5)
    return (
      <Pill kind="danger">
        <Clock size={11} /> 剩 {days} 日
      </Pill>
    );
  if (days <= 10)
    return (
      <Pill kind="warn">
        <Clock size={11} /> 剩 {days} 日
      </Pill>
    );
  return (
    <Pill kind="muted">
      <Clock size={11} /> 剩 {days} 日
    </Pill>
  );
}

function statusOf(r: UnclaimedRow): {
  kind: "pending" | "matched" | "accepted" | "expiring";
  label: string;
} {
  const days = daysUntilAbandon(r.arrived_at);
  if (r.status === "assigned") {
    if (r.assigned_to_inbound_id) {
      return { kind: "accepted", label: "已認領" };
    }
    return { kind: "matched", label: "等客戶接受" };
  }
  if (days <= 5) return { kind: "expiring", label: "即將棄置" };
  return { kind: "pending", label: "等匹配" };
}

function StatusPill({ kind, label }: ReturnType<typeof statusOf>) {
  if (kind === "expiring")
    return (
      <Pill kind="danger">
        <Flame size={11} /> {label}
      </Pill>
    );
  if (kind === "matched") return <Pill kind="info">{label}</Pill>;
  if (kind === "accepted")
    return (
      <Pill kind="ok">
        <Check size={11} strokeWidth={2.5} /> {label}
      </Pill>
    );
  return <Pill kind="warn">{label}</Pill>;
}

export function UnclaimedPageClient() {
  const [rows, setRows] = React.useState<UnclaimedRow[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [candidates, setCandidates] = React.useState<MatchCandidate[]>([]);
  const [tab, setTab] = React.useState<"all" | "pending" | "matched" | "expiring">("all");
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const res = await get_request("/api/wms/unclaimed-inbounds");
      const json = await res.json();
      if (json?.status === 200) setRows(json.data ?? []);
      else setError(json?.message ?? "Load failed");
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    }
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const loadCandidates = React.useCallback(async (id: string) => {
    try {
      const res = await get_request(`/api/wms/unclaimed/${id}/match-existing`);
      const json = await res.json();
      if (json?.status === 200) setCandidates(json.data?.candidates ?? []);
      else setCandidates([]);
    } catch {
      setCandidates([]);
    }
  }, []);

  React.useEffect(() => {
    if (selectedId) loadCandidates(selectedId);
    else setCandidates([]);
  }, [selectedId, loadCandidates]);

  const filteredRows = React.useMemo(() => {
    return rows.filter((r) => {
      const s = statusOf(r).kind;
      if (tab === "all") return true;
      return s === tab;
    });
  }, [rows, tab]);

  const counts = React.useMemo(() => {
    const c = { all: rows.length, pending: 0, matched: 0, accepted: 0, expiring: 0 };
    for (const r of rows) {
      c[statusOf(r).kind] += 1;
    }
    return c;
  }, [rows]);

  const selected = rows.find((r) => r._id === selectedId);

  const assignToCandidate = async (candidate: MatchCandidate) => {
    if (!selectedId) return;
    try {
      const res = await post_request(
        `/api/wms/unclaimed/${selectedId}/assign`,
        { client_id: candidate.client_id, inbound_id: candidate._id }
      );
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Assign failed");
      }
      await reload();
      setSelectedId(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  return (
    <WmsShell crumbs={[{ label: "管理" }, { label: "無頭件池" }]}>
      <div className="px-[22px] py-3.5">
        <div className="mb-3.5 flex items-end gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">
              無頭件池
            </h1>
            <div className="mt-1 text-[13px] text-wms-muted">
              無 OMS 預報嘅集運件 · 30 天未認領將視作棄件
            </div>
          </div>
          <span className="flex-1" />
          <button className="inline-flex items-center gap-1.5 rounded-md border border-wms-border bg-wms-surface px-2.5 py-1 text-xs hover:bg-wms-row-hover">
            <Filter size={13} /> 篩選
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-3 py-2 text-sm text-wms-danger-fg">
            {error}
          </div>
        )}

        <div className="mb-3.5 flex gap-2.5">
          <Kpi
            icon={<HelpCircle size={18} />}
            n={counts.all}
            lbl="目前池中"
            sub="總件數"
          />
          <Kpi
            icon={<Clock size={18} />}
            n={counts.expiring}
            lbl="即將棄置 (≤5 天)"
            sub="自動 / 客戶拒絕"
          />
          <Kpi
            icon={<User size={18} />}
            n={counts.matched}
            lbl="等客戶接受"
            sub="CS 已匹配, 等回應"
          />
          <Kpi
            icon={<Check size={18} />}
            n={counts.accepted}
            lbl="本期成功匹配"
            sub="入正常集運流程"
          />
        </div>

        <div className="mb-2.5 flex items-center gap-2.5">
          <div className="inline-flex gap-0.5 rounded-[10px] border border-wms-border bg-wms-surface-alt p-1">
            {([
              ["all", `全部 · ${counts.all}`],
              ["pending", `等匹配 · ${counts.pending}`],
              ["matched", `等客戶接受 · ${counts.matched}`],
              ["expiring", `即將棄置 · ${counts.expiring}`],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k as any)}
                className={cn(
                  "rounded-md px-3 py-1 text-[13px] font-medium",
                  tab === k
                    ? "bg-wms-surface text-wms-ink shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_var(--tw-shadow-color)] shadow-wms-border"
                    : "text-wms-muted hover:bg-wms-row-hover"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <div className="w-[320px]">
            <Scanner
              placeholder="掃 inbound 條碼定位無頭件…"
              onScan={(v) => {
                const r = rows.find(
                  (x) => x.tracking_no === v || x._id === v
                );
                if (r) setSelectedId(r._id);
              }}
            />
          </div>
        </div>

        <div className="flex gap-3 pb-6">
          <div className="flex-[1.9] overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-wms-border bg-wms-surface-alt text-[11.5px] text-wms-muted">
                  <th className="px-3 py-2.5 text-left font-medium">U #</th>
                  <th className="px-3 py-2.5 text-left font-medium">外箱條碼</th>
                  <th className="px-3 py-2.5 text-left font-medium">規格</th>
                  <th className="px-3 py-2.5 text-left font-medium">貨架</th>
                  <th className="px-3 py-2.5 text-left font-medium">到貨</th>
                  <th className="px-3 py-2.5 text-left font-medium">棄置倒數</th>
                  <th className="px-3 py-2.5 text-left font-medium">狀態</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-wms-faint">
                      池中無記錄
                    </td>
                  </tr>
                )}
                {filteredRows.map((r) => {
                  const days = daysUntilAbandon(r.arrived_at);
                  const s = statusOf(r);
                  return (
                    <tr
                      key={r._id}
                      onClick={() => setSelectedId(r._id)}
                      className={cn(
                        "cursor-pointer border-b border-wms-border last:border-b-0",
                        selectedId === r._id ? "bg-wms-row-select" : "hover:bg-wms-row-hover"
                      )}
                    >
                      <td className="px-3 py-2.5 font-wms-mono font-semibold">{r._id}</td>
                      <td className="px-3 py-2.5 font-wms-mono text-[11.5px] text-wms-muted">
                        {r.tracking_no}
                      </td>
                      <td className="px-3 py-2.5 font-wms-mono text-[11.5px]">
                        {r.weight ? `${r.weight}kg` : "—"}
                        {r.dimension &&
                          ` · ${r.dimension.length}×${r.dimension.width}×${r.dimension.height}`}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.locationCode ? (
                          <span className="rounded bg-wms-brand-soft px-2 py-px font-wms-mono text-[11.5px] font-semibold text-wms-brand">
                            {r.locationCode}
                          </span>
                        ) : (
                          <Pill kind="muted">未上架</Pill>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-wms-muted">
                        {new Date(r.arrived_at).toLocaleString("zh-HK", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2.5">
                        <CountdownPill days={days} />
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill {...s} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex-1 self-start">
            {selected ? (
              <div className="rounded-xl border border-wms-border bg-wms-surface p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[11.5px] font-semibold uppercase tracking-wider text-wms-faint">
                    已選 1 件 · CS 匹配
                  </span>
                  <span className="flex-1" />
                  <Pill kind="danger">無頭件</Pill>
                </div>
                <h2 className="text-base font-semibold">{selected._id}</h2>
                <div className="mb-3 mt-0.5 text-[12.5px] text-wms-muted">
                  外箱: {selected.tracking_no} ·{" "}
                  收貨 {new Date(selected.arrived_at).toLocaleDateString("zh-HK")} ·{" "}
                  上架: {selected.locationCode ?? "未上架"}
                </div>

                <div className="mb-3 text-[12px] leading-relaxed text-wms-muted">
                  {selected.weight ? `${selected.weight}kg ` : ""}
                  {selected.dimension &&
                    `${selected.dimension.length}×${selected.dimension.width}×${selected.dimension.height}cm`}
                  {selected.staff_note ? ` · ${selected.staff_note}` : ""}
                </div>

                <div className="mb-1.5 text-[12.5px] font-semibold">
                  系統建議匹配
                </div>
                {candidates.length === 0 ? (
                  <div className="mb-2.5 rounded-md bg-wms-surface-alt p-3 text-center text-xs text-wms-faint">
                    冇 tracking 完全 match 的客戶 pending inbound
                  </div>
                ) : (
                  <div className="mb-2.5 flex flex-col gap-1.5">
                    {candidates.map((c) => {
                      const conf = c.confidence_score ?? 0;
                      return (
                        <button
                          key={c._id}
                          onClick={() => assignToCandidate(c)}
                          className="flex items-center gap-2.5 rounded-lg border border-wms-border bg-wms-surface p-2.5 text-left hover:bg-wms-surface-alt"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-wms-brand-soft font-semibold text-wms-brand">
                            {c.client_id.slice(-2).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-medium">
                              {c.client_id.slice(-6).toUpperCase()}
                            </div>
                            <div className="text-[11px] text-wms-faint">
                              {(c.confidence_reasons ?? []).join(" · ") || "tracking match"}
                            </div>
                          </div>
                          <div
                            className={cn(
                              "rounded px-2 py-0.5 font-wms-mono text-[11px] font-semibold",
                              conf > 70
                                ? "bg-wms-ok-bg text-wms-ok-fg"
                                : "bg-wms-warn-bg text-wms-warn-fg"
                            )}
                          >
                            {conf}%
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mb-3 rounded-lg bg-wms-info-bg p-2.5 text-[11.5px] leading-relaxed text-wms-info-fg">
                  匹配後客戶會收到 OMS 通知 · 客戶確認接受 → 自動入集運流程
                </div>
                <button className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-xs text-wms-muted hover:bg-wms-row-hover">
                  <X size={13} /> 標記為廢棄件
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-wms-border-strong bg-wms-surface-alt p-8 text-center text-sm text-wms-faint">
                揀左邊一個無頭件 → CS 匹配 panel 即出
              </div>
            )}
          </div>
        </div>
      </div>
    </WmsShell>
  );
}

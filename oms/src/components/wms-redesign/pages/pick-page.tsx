// P17 — handoff #pick page.
//
// Two main panels:
//   - Ready pool (left)       — outbounds in status="ready_for_label"
//   - Batch builder (right)   — selection drives sticky panel with two
//                                CTAs: dispatch to PDA OR print pick list
//
// Above: today's batches table (active/recent). Below: NextCTA.
//
// API contract:
//   GET  /api/wms/pick-batch?status=draft,picking,picked  → today batches
//   GET  /api/wms/pick-batch/batchable                    → ready pool
//   POST /api/wms/pick-batch                              → create batch
//   POST /api/wms/pick-batch/{id}/start                   → status → picking
// "Print pick list" uses the existing pick-batch/[id]/print route.

"use client";

import { ArrowRight, Filter, Printer, Scan } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { ModeBadge } from "@/components/wms-redesign/mode-badge";
import { NextCTA } from "@/components/wms-redesign/next-cta";
import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { Stepper } from "@/components/wms-redesign/stepper";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { get_request, post_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";

interface ReadyOutbound {
  _id: string;
  client_id: string;
  client_code?: string | null;
  carrier_code: string;
  inbound_count: number;
  destination_country: string;
  shipment_type: "consolidated" | "single";
  is_yt?: boolean;
}

interface BatchRow {
  _id: string;
  status: string;
  outbound_ids: string[];
  warehouseCode: string;
  started_at?: string | null;
  picked_at?: string | null;
  created_by_staff_id?: string | null;
}

const SHIPPING_STEPPER = [
  { label: "揀貨任務", state: "current" as const },
  { label: "裝箱", state: "todo" as const },
  { label: "秤重取單", state: "todo" as const },
  { label: "印單", state: "todo" as const },
  { label: "離站", state: "todo" as const },
];

function batchStatusPill(status: string) {
  if (status === "draft") return <Pill kind="muted">建構中</Pill>;
  if (status === "picking") return <Pill kind="warn">PDA 揀貨中</Pill>;
  if (status === "picked") return <Pill kind="ok">揀完</Pill>;
  if (status === "cancelled") return <Pill kind="danger">已取消</Pill>;
  return <Pill kind="muted">{status}</Pill>;
}

function modeOf(ob: ReadyOutbound): "consolidated" | "single" | "yt" {
  if (ob.is_yt) return "yt";
  return ob.shipment_type === "single" ? "single" : "consolidated";
}

export function PickPageClient() {
  const router = useRouter();
  const [readies, setReadies] = React.useState<ReadyOutbound[]>([]);
  const [batches, setBatches] = React.useState<BatchRow[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [justDispatched, setJustDispatched] = React.useState(false);
  // 進頁第一次 load Ready 池後自動全選；之後人手 toggle 不被覆蓋
  const didInitSelectRef = React.useRef(false);

  const reload = React.useCallback(async () => {
    setError(null);
    try {
      const [batchablesRes, batchesRes] = await Promise.all([
        get_request("/api/wms/pick-batch/batchable"),
        get_request("/api/wms/pick-batch?status=draft,picking,picked&limit=10"),
      ]);
      const batchablesJson = await batchablesRes.json();
      const batchesJson = await batchesRes.json();
      const list: ReadyOutbound[] = batchablesJson?.data ?? [];
      setReadies(list);
      setBatches(batchesJson?.data?.batches ?? batchesJson?.data ?? []);
      if (!didInitSelectRef.current && list.length > 0) {
        setSelected(new Set(list.map((r) => r._id)));
        didInitSelectRef.current = true;
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedList = readies.filter((r) => selected.has(r._id));
  const totalItems = selectedList.reduce((s, r) => s + (r.inbound_count ?? 0), 0);

  const createAndStart = async (mode: "pda" | "print") => {
    if (selectedList.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const createRes = await post_request("/api/wms/pick-batch", {
        outbound_ids: Array.from(selected),
      });
      const created = await createRes.json();
      if (created?.status !== 200) {
        throw new Error(created?.message ?? "Create batch failed");
      }
      const batchId = created?.data?._id ?? created?.data?.batch?._id;
      if (!batchId) throw new Error("Batch id missing in response");
      const startRes = await post_request(
        `/api/wms/pick-batch/${batchId}/start`,
        {}
      );
      const started = await startRes.json();
      if (started?.status !== 200) {
        throw new Error(started?.message ?? "Start batch failed");
      }
      setSelected(new Set());
      setJustDispatched(true);
      window.setTimeout(() => setJustDispatched(false), 1500);
      if (mode === "print") {
        router.push(`/zh-hk/wms/operations/pick-batch/${batchId}/print`);
      } else {
        await reload();
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const hasActive = batches.some((b) => b.status !== "cancelled");
  const ctaState: "locked" | "urgent" | "ready" = hasActive
    ? "ready"
    : selected.size === 0
      ? "locked"
      : "urgent";

  return (
    <WmsShell
      crumbs={[
        { label: "出貨作業" },
        { label: "揀貨任務" },
      ]}
      cta={
        <NextCTA
          state={ctaState}
          to="pick"
          progress={
            batches.length > 0
              ? {
                  done: batches.filter((b) => b.status === "picked").length,
                  total: batches.length,
                }
              : undefined
          }
          lockedHint={
            selected.size === 0 ? "勾選 OB 後生成揀貨任務（同時自動推送 PDA）" : undefined
          }
          urgentHint={
            selected.size > 0
              ? `已選 ${selected.size} 單未生成任務`
              : undefined
          }
          justFlipped={justDispatched}
          back={{ url: "/zh-hk/wms", label: "工作台" }}
          customMainCTA={
            hasActive ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    router.push("/zh-hk/wms/operations/pick-confirm")
                  }
                  className="inline-flex items-center gap-2 rounded-[10px] border border-wms-border bg-wms-surface px-4 py-2.5 text-[13.5px] font-semibold text-wms-ink hover:bg-wms-row-hover"
                >
                  <Printer size={15} />
                  實體單揀貨 · 去揀貨確認
                  <ArrowRight size={14} />
                </button>
                <button
                  onClick={() => router.push("/zh-hk/wms/operations/pack")}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-wms-ink px-4 py-2.5 text-[13.5px] font-semibold text-white hover:brightness-110"
                >
                  <Scan size={15} />
                  PDA 揀貨 · 去桌面裝箱
                  <ArrowRight size={14} />
                </button>
              </div>
            ) : undefined
          }
        />
      }
    >
      <div className="px-[22px] py-3.5">
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-wms-border bg-wms-surface-alt px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-wms-faint">
            出貨流程
          </span>
          <Stepper steps={SHIPPING_STEPPER} />
        </div>

        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">
            揀貨任務
          </h1>
          <Pill kind="muted">
            {readies.length} 單 ready · {batches.filter((b) => b.status === "picking").length} 批次揀貨中
          </Pill>
          <span className="flex-1" />
          <div className="w-[320px]">
            <Scanner
              placeholder="掃 outbound barcode 即加入批次…"
              onScan={(v) => {
                const m = readies.find((r) => r._id === v);
                if (m) toggle(v);
              }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-4 py-3 text-sm text-wms-danger-fg">
            {error}
          </div>
        )}

        <div className="mb-3.5 overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
          <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
            <h3 className="text-sm font-semibold">今日批次</h3>
            <Pill kind="muted">
              {batches.filter((b) => b.status === "picking").length} 進行 · {batches.length} 共
            </Pill>
            <span className="flex-1" />
            <button className="inline-flex items-center gap-1.5 rounded-md border border-wms-border px-2.5 py-1 text-xs hover:bg-wms-row-hover">
              <Filter size={13} /> 篩選
            </button>
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-wms-border bg-wms-surface-alt text-[11.5px] text-wms-muted">
                <th className="px-3 py-2.5 text-left font-medium">批次 #</th>
                <th className="px-3 py-2.5 text-left font-medium">內容</th>
                <th className="px-3 py-2.5 text-left font-medium">OB</th>
                <th className="px-3 py-2.5 text-left font-medium">建立</th>
                <th className="px-3 py-2.5 text-left font-medium">狀態</th>
                <th className="px-3 py-2.5 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-wms-faint">
                    今日仲未有批次
                  </td>
                </tr>
              )}
              {batches.map((b) => (
                <tr
                  key={b._id}
                  className="cursor-pointer border-b border-wms-border last:border-b-0 hover:bg-wms-row-hover"
                  onClick={() =>
                    router.push(`/zh-hk/wms/operations/pick-batch/${b._id}`)
                  }
                >
                  <td className="px-3 py-2.5 font-wms-mono font-semibold">{b._id}</td>
                  <td className="px-3 py-2.5">{b.outbound_ids?.length ?? 0} 單</td>
                  <td className="px-3 py-2.5 font-wms-mono text-wms-muted">
                    {(b.outbound_ids ?? []).slice(0, 3).join(", ")}
                    {(b.outbound_ids?.length ?? 0) > 3 ? " …" : ""}
                  </td>
                  <td className="px-3 py-2.5 text-wms-muted">
                    {b.started_at
                      ? new Date(b.started_at).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">{batchStatusPill(b.status)}</td>
                  <td className="px-3 py-2.5 text-right text-wms-faint">
                    <ArrowRight size={14} className="ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-3.5 flex gap-3">
          <div className="flex-[1.6] overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
            <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
              <h3 className="text-sm font-semibold">Ready 池</h3>
              <Pill kind="muted">{readies.length} 單</Pill>
              <span className="flex-1" />
              <button
                className="rounded-md border border-wms-border px-2.5 py-1 text-xs hover:bg-wms-row-hover"
                onClick={() =>
                  setSelected(new Set(readies.map((r) => r._id)))
                }
              >
                全選
              </button>
              <button
                className="rounded-md border border-wms-border px-2.5 py-1 text-xs hover:bg-wms-row-hover"
                onClick={() => setSelected(new Set())}
              >
                清空
              </button>
            </div>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-wms-border bg-wms-surface-alt text-[11.5px] text-wms-muted">
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5 text-left font-medium">OB #</th>
                  <th className="px-3 py-2.5 text-left font-medium">模式</th>
                  <th className="px-3 py-2.5 text-left font-medium">客戶</th>
                  <th className="px-3 py-2.5 text-left font-medium">件數</th>
                  <th className="px-3 py-2.5 text-left font-medium">Carrier</th>
                  <th className="px-3 py-2.5 text-left font-medium">目的地</th>
                </tr>
              </thead>
              <tbody>
                {readies.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-wms-faint">
                      無 ready 單
                    </td>
                  </tr>
                )}
                {readies.map((r) => {
                  const isOn = selected.has(r._id);
                  return (
                    <tr
                      key={r._id}
                      className={cn(
                        "border-b border-wms-border last:border-b-0",
                        isOn && "bg-wms-row-select"
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggle(r._id)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-wms-mono font-medium">
                        {r._id}
                      </td>
                      <td className="px-3 py-2.5">
                        <ModeBadge mode={modeOf(r)} />
                      </td>
                      <td className="px-3 py-2.5 font-medium">
                        {r.client_code ?? r.client_id.slice(-4).toUpperCase()}
                      </td>
                      <td className="px-3 py-2.5 font-wms-mono">
                        {r.inbound_count}
                      </td>
                      <td className="px-3 py-2.5 font-wms-mono text-wms-muted">
                        {r.carrier_code}
                      </td>
                      <td className="px-3 py-2.5 font-wms-mono text-wms-muted">
                        {r.destination_country}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sticky top-0 flex-1 self-start rounded-xl border border-wms-border bg-wms-surface p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-wider text-wms-faint">
                批次草稿
              </span>
              <span className="flex-1" />
              <Pill kind={selected.size === 0 ? "muted" : "ink"}>
                {selected.size} 單
              </Pill>
            </div>
            <h2 className="mb-2 text-base font-semibold">
              {selected.size === 0
                ? "勾選 OB 加入批次"
                : `${selected.size} 單 · ${totalItems} 件`}
            </h2>

            {selected.size === 0 ? (
              <div className="rounded-lg bg-wms-surface-alt p-5 text-center text-[13px] text-wms-faint">
                喺左邊勾選 OB 加入批次
              </div>
            ) : (
              <>
                <div className="mb-3 rounded-lg bg-wms-surface-alt p-2.5">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-wms-faint">
                    已選
                  </div>
                  <div className="flex flex-col gap-1">
                    {selectedList.slice(0, 6).map((r) => (
                      <div
                        key={r._id}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <span className="min-w-[60px] font-wms-mono">
                          {r._id}
                        </span>
                        <span className="flex-1 truncate text-wms-ink-2">
                          {r.client_code ?? r.client_id.slice(-4).toUpperCase()}
                        </span>
                        <ModeBadge mode={modeOf(r)} />
                      </div>
                    ))}
                    {selectedList.length > 6 && (
                      <div className="text-[11px] text-wms-faint">
                        +{selectedList.length - 6} more
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-2.5 text-xs text-wms-muted">
                  生成揀貨任務 · PDA 與紙本並行
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => createAndStart("pda")}
                    disabled={busy}
                    className="flex items-center gap-2.5 rounded-[10px] border border-wms-ink bg-wms-ink px-3.5 py-3 text-left text-white hover:brightness-110 disabled:opacity-50"
                  >
                    <Scan size={16} />
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold">
                        生成揀貨任務
                      </div>
                      <div className="text-[11px] opacity-80">
                        建立批次 + 自動推送 PDA · 工人即時開始
                      </div>
                    </div>
                    <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={() => createAndStart("print")}
                    disabled={busy}
                    className="flex items-center gap-2.5 rounded-[10px] border border-wms-border bg-wms-surface px-3.5 py-3 text-left hover:bg-wms-row-hover disabled:opacity-50"
                  >
                    <Printer size={16} />
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold">
                        列印揀貨單
                      </div>
                      <div className="text-[11px] text-wms-muted">
                        生成任務後同時列印紙本（仍會推 PDA）
                      </div>
                    </div>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </WmsShell>
  );
}

// W5 — PC pick-confirm re-scan page.
//
// Flow: warehouse prints a pick list (pick-batch/[id]/print), grabs
// every item off the shelves (physical, no system action), then
// returns to this PC page and re-scans each tracking_no to confirm
// the pick. Each scan calls the existing pick-by-tracking endpoint
// with batch_id scope, which flips inbound.status → "picking", and
// (on the last scan) auto-advances the batch via
// pickBatchService.checkBatchPickComplete inside wmsFlow.
//
// We deliberately reuse pick-by-tracking instead of minting a new
// "confirm" mutation: the re-scan IS the pick in this flow (nothing
// happens between print and re-scan in the system).
//
// URL: /[locale]/wms/operations/pick-confirm?batchId=PB-...
// Without batchId → batch picker view.

"use client";

import { ArrowRight, Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { NextCTA } from "@/components/wms-redesign/next-cta";
import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { get_request, post_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";

interface BatchRow {
  _id: string;
  status: string;
  outbound_ids: string[];
  started_at?: string | null;
}

interface BatchItem {
  inbound_id: string;
  tracking_no: string;
  outbound_id: string;
  outbound_short: string;
  client_id: string;
  client_code: string | null;
  declared_name: string | null;
  locationCode: string | null;
  status: "pending" | "picked";
}

interface BatchItemsData {
  batch_id: string;
  batch_status: string;
  total_items: number;
  picked_items: number;
  items: BatchItem[];
}

type Flash = { kind: "ok" | "warn" | "err"; text: string } | null;

function statusPill(status: string) {
  if (status === "picking") return <Pill kind="warn">揀貨中</Pill>;
  if (status === "picked") return <Pill kind="ok">揀完</Pill>;
  if (status === "draft") return <Pill kind="muted">建構中</Pill>;
  return <Pill kind="muted">{status}</Pill>;
}

function BatchPicker({
  onPick,
}: {
  onPick: (batchId: string) => void;
}) {
  const [batches, setBatches] = React.useState<BatchRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await get_request(
          "/api/wms/pick-batch?status=picking&limit=20"
        );
        const d = await r.json();
        if (d?.status !== 200) {
          setError(d?.message ?? "載入批次失敗");
          setBatches([]);
        } else {
          // listBatches can return array or { batches } depending on caller;
          // mirror pick-page.tsx logic.
          setBatches(d?.data?.batches ?? d?.data ?? []);
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="px-[22px] py-3.5">
      <div className="mb-3.5 flex items-center gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight">
          揀貨完成確認
        </h1>
        <Pill kind="muted">揀完返 PC 再掃確認</Pill>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-4 py-3 text-sm text-wms-danger-fg">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
        <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
          <h3 className="text-sm font-semibold">揀貨中嘅批次</h3>
          <Pill kind="muted">{batches.length}</Pill>
          <span className="flex-1" />
          <span className="text-[11.5px] text-wms-faint">
            揀盡所有件後自動標 picked
          </span>
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-wms-border bg-wms-surface-alt text-[11.5px] text-wms-muted">
              <th className="px-3 py-2.5 text-left font-medium">批次 #</th>
              <th className="px-3 py-2.5 text-left font-medium">OB 數</th>
              <th className="px-3 py-2.5 text-left font-medium">啟動時間</th>
              <th className="px-3 py-2.5 text-left font-medium">狀態</th>
              <th className="px-3 py-2.5 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-wms-faint">
                  載入中…
                </td>
              </tr>
            )}
            {!loading && batches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-wms-faint">
                  暫無揀貨中嘅批次
                </td>
              </tr>
            )}
            {!loading &&
              batches.map((b) => (
                <tr
                  key={b._id}
                  className="cursor-pointer border-b border-wms-border last:border-b-0 hover:bg-wms-row-hover"
                  onClick={() => onPick(b._id)}
                >
                  <td className="px-3 py-2.5 font-wms-mono font-semibold">
                    {b._id}
                  </td>
                  <td className="px-3 py-2.5">{b.outbound_ids?.length ?? 0}</td>
                  <td className="px-3 py-2.5 text-wms-muted">
                    {b.started_at
                      ? new Date(b.started_at).toLocaleTimeString("zh-HK", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">{statusPill(b.status)}</td>
                  <td className="px-3 py-2.5 text-right text-wms-faint">
                    <ArrowRight size={14} className="ml-auto" />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfirmScanView({
  batchId,
  onBack,
  onProgressChange,
}: {
  batchId: string;
  onBack: () => void;
  onProgressChange?: (s: { allDone: boolean; picked: number; total: number }) => void;
}) {
  const [data, setData] = React.useState<BatchItemsData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<Flash>(null);
  const [busy, setBusy] = React.useState(false);
  const [lastEcho, setLastEcho] = React.useState<string | null>(null);

  const flashFor = React.useCallback((f: Flash, ms = 1800) => {
    setFlash(f);
    if (f) {
      window.setTimeout(
        () => setFlash((cur) => (cur === f ? null : cur)),
        ms
      );
    }
  }, []);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const r = await get_request(
        `/api/wms/pick-batch/${encodeURIComponent(batchId)}/items`
      );
      const d = await r.json();
      if (d?.status !== 200) {
        setError(d?.message ?? "載入項目失敗");
        return;
      }
      setData(d.data as BatchItemsData);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [batchId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const onScan = React.useCallback(
    async (raw: string) => {
      const tracking = raw.trim();
      if (!tracking || busy || !data) return;

      // Pre-flight client-side checks against last loaded snapshot.
      // Server is source of truth, but a fast UI message saves a roundtrip.
      const match = data.items.find((it) => it.tracking_no === tracking);
      if (!match) {
        flashFor({
          kind: "err",
          text: `此件不在該揀貨批次：${tracking}`,
        });
        return;
      }
      if (match.status === "picked") {
        flashFor({
          kind: "warn",
          text: `已掃過：${tracking}`,
        });
        setLastEcho(tracking);
        return;
      }

      setBusy(true);
      try {
        const r = await post_request("/api/wms/outbound/pick-by-tracking", {
          tracking_no: tracking,
          locationCode: match.locationCode ?? undefined,
          batch_id: batchId,
        });
        const d = await r.json();
        if (d?.status !== 200) {
          flashFor({
            kind: "err",
            text: d?.message ?? "確認失敗",
          });
          return;
        }
        setLastEcho(tracking);
        flashFor({ kind: "ok", text: `已確認：${tracking}` }, 1200);
        await load();
      } catch (e: any) {
        flashFor({
          kind: "err",
          text: e?.message ?? String(e),
        });
      } finally {
        setBusy(false);
      }
    },
    [batchId, busy, data, flashFor, load]
  );

  const total = data?.total_items ?? 0;
  const picked = data?.picked_items ?? 0;
  const pending = total - picked;
  const allDone = total > 0 && pending === 0;
  const pct = total > 0 ? Math.round((picked / total) * 100) : 0;

  // 向上層 report 進度，俾 parent 渲染 NextCTA「下一步：去裝箱」
  React.useEffect(() => {
    onProgressChange?.({ allDone, picked, total });
  }, [allDone, picked, total, onProgressChange]);

  return (
    <div className="px-[22px] py-3.5">
      <div className="mb-3.5 flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-md border border-wms-border px-2.5 py-1 text-xs hover:bg-wms-row-hover"
        >
          ← 揀別個批次
        </button>
        <h1 className="text-[22px] font-semibold tracking-tight">
          揀貨完成確認
        </h1>
        <span className="font-wms-mono text-sm text-wms-muted">{batchId}</span>
        {data && statusPill(data.batch_status)}
        <span className="flex-1" />
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-4 py-3 text-sm text-wms-danger-fg">
          {error}
        </div>
      )}

      <div className="mb-3.5 rounded-xl border border-wms-border bg-wms-surface p-4">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider text-wms-faint">
            進度
          </span>
          <span className="font-wms-mono text-lg font-semibold">
            {picked} / {total}
          </span>
          <Pill kind={allDone ? "ok" : pending > 0 ? "warn" : "muted"}>
            {allDone ? "全部已確認" : `仲有 ${pending} 件未掃`}
          </Pill>
          <span className="flex-1" />
          <span className="font-wms-mono text-sm text-wms-muted">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-wms-surface-alt">
          <div
            className={cn(
              "h-full transition-all",
              allDone ? "bg-wms-ok-fg" : "bg-wms-ink"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mb-3.5">
        <Scanner
          placeholder="掃描已揀貨件條碼…"
          echo={lastEcho}
          disabled={busy || allDone}
          onScan={onScan}
        />
        {allDone && (
          <div className="mt-2 rounded-lg border border-wms-ok-fg/30 bg-wms-ok-bg px-4 py-3 text-sm text-wms-ok-fg">
            ✓ 此批次全部件已確認。批次已自動標為 picked，可前往裝箱。
          </div>
        )}
        {flash && (
          <div
            className={cn(
              "mt-2 rounded-lg px-4 py-2 text-sm",
              flash.kind === "ok" &&
                "border border-wms-ok-fg/30 bg-wms-ok-bg text-wms-ok-fg",
              flash.kind === "warn" &&
                "border border-wms-warn-fg/30 bg-wms-warn-bg text-wms-warn-fg",
              flash.kind === "err" &&
                "border border-wms-danger-fg/30 bg-wms-danger-bg text-wms-danger-fg"
            )}
          >
            {flash.text}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <div className="flex-1 overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
          <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
            <h3 className="text-sm font-semibold">未確認</h3>
            <Pill kind={pending > 0 ? "warn" : "ok"}>{pending}</Pill>
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-wms-border bg-wms-surface-alt text-[11.5px] text-wms-muted">
                <th className="px-3 py-2 text-left font-medium">Tracking</th>
                <th className="px-3 py-2 text-left font-medium">OB</th>
                <th className="px-3 py-2 text-left font-medium">客戶</th>
                <th className="px-3 py-2 text-left font-medium">貨架</th>
              </tr>
            </thead>
            <tbody>
              {data?.items
                .filter((it) => it.status === "pending")
                .map((it) => (
                  <tr
                    key={it.inbound_id}
                    className="border-b border-wms-border last:border-b-0"
                  >
                    <td className="px-3 py-2 font-wms-mono">{it.tracking_no}</td>
                    <td className="px-3 py-2 font-wms-mono text-wms-muted">
                      {it.outbound_short}
                    </td>
                    <td className="px-3 py-2">
                      {it.client_code ??
                        it.client_id.slice(-4).toUpperCase()}
                    </td>
                    <td className="px-3 py-2 font-wms-mono text-wms-muted">
                      {it.locationCode ?? "—"}
                    </td>
                  </tr>
                ))}
              {pending === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-wms-faint"
                  >
                    全部已確認
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
          <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
            <h3 className="text-sm font-semibold">已確認</h3>
            <Pill kind="ok">{picked}</Pill>
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-wms-border bg-wms-surface-alt text-[11.5px] text-wms-muted">
                <th className="w-8 px-3 py-2 text-left font-medium" />
                <th className="px-3 py-2 text-left font-medium">Tracking</th>
                <th className="px-3 py-2 text-left font-medium">OB</th>
                <th className="px-3 py-2 text-left font-medium">客戶</th>
              </tr>
            </thead>
            <tbody>
              {data?.items
                .filter((it) => it.status === "picked")
                .map((it) => (
                  <tr
                    key={it.inbound_id}
                    className="border-b border-wms-border last:border-b-0"
                  >
                    <td className="px-3 py-2 text-wms-ok-fg">
                      <Check size={14} strokeWidth={2.5} />
                    </td>
                    <td className="px-3 py-2 font-wms-mono">{it.tracking_no}</td>
                    <td className="px-3 py-2 font-wms-mono text-wms-muted">
                      {it.outbound_short}
                    </td>
                    <td className="px-3 py-2">
                      {it.client_code ??
                        it.client_id.slice(-4).toUpperCase()}
                    </td>
                  </tr>
                ))}
              {picked === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-wms-faint"
                  >
                    尚未確認任何件
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PickConfirmPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batchId");
  const [progress, setProgress] = React.useState<{
    allDone: boolean;
    picked: number;
    total: number;
  }>({ allDone: false, picked: 0, total: 0 });

  // Reset progress 當切換到別個 batch / 或返到列表
  React.useEffect(() => {
    setProgress({ allDone: false, picked: 0, total: 0 });
  }, [batchId]);

  const handlePick = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("batchId", id);
    router.replace(`?${sp.toString()}`);
  };

  const handleBack = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("batchId");
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?");
  };

  const ctaState: "locked" | "ready" =
    batchId && progress.allDone ? "ready" : "locked";

  const [completeConfirmOpen, setCompleteConfirmOpen] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);
  const [completeError, setCompleteError] = React.useState<string | null>(null);

  const handleCompletePick = async () => {
    if (!batchId) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await post_request(
        `/api/wms/pick-batch/${encodeURIComponent(batchId)}/close`,
        {}
      );
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "揀貨完成失敗");
      }
      setCompleteConfirmOpen(false);
      router.push("/zh-hk/wms/operations/pack");
    } catch (e: any) {
      setCompleteError(e?.message ?? String(e));
    } finally {
      setCompleting(false);
    }
  };

  return (
    <>
    <WmsShell
      crumbs={[
        { label: "集運流程" },
        { label: "揀貨完成確認" },
      ]}
      cta={
        batchId ? (
          <NextCTA
            state={ctaState}
            to="pick"
            progress={
              progress.total > 0
                ? { done: progress.picked, total: progress.total }
                : undefined
            }
            lockedHint={
              progress.total === 0
                ? "等候批次資料載入…"
                : `仲有 ${progress.total - progress.picked} 件未確認`
            }
            justFlipped={progress.allDone}
            back={{
              url: "/zh-hk/wms",
              label: "工作台",
            }}
            customMainCTA={
              ctaState === "ready" ? (
                <button
                  onClick={() => setCompleteConfirmOpen(true)}
                  disabled={completing}
                  className="animate-wms-cta-pulse inline-flex items-center gap-2.5 whitespace-nowrap rounded-[12px] bg-wms-brand px-[26px] py-3.5 text-[16px] font-semibold text-white transition-all hover:scale-[1.03] motion-reduce:animate-none disabled:opacity-60"
                >
                  <span>揀貨完成 · 去裝箱</span>
                  <ArrowRight size={18} strokeWidth={2.5} />
                  <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 font-wms-mono text-[11px] font-medium">
                    ↵
                  </span>
                </button>
              ) : undefined
            }
          />
        ) : undefined
      }
    >
      {batchId ? (
        <ConfirmScanView
          batchId={batchId}
          onBack={handleBack}
          onProgressChange={setProgress}
        />
      ) : (
        <BatchPicker onPick={handlePick} />
      )}
    </WmsShell>
    <AlertDialog open={completeConfirmOpen} onOpenChange={setCompleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確認揀貨完成？</AlertDialogTitle>
          <AlertDialogDescription>
            批次 <strong className="font-wms-mono">{batchId}</strong> 已全部 {progress.total} 件確認。
            <br />
            <br />
            按確認後：批次會由 <strong>picked</strong> 推到 <strong>closed</strong>（釋放揀貨站），然後跳去裝箱頁面。closed 之後唔可以再回頭加件揀貨。
            {completeError && (
              <span className="mt-3 block rounded-md border border-wms-danger-fg/30 bg-wms-danger-bg px-3 py-2 text-wms-danger-fg">
                {completeError}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={completing}>返回</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleCompletePick();
            }}
            disabled={completing}
          >
            {completing ? "處理中…" : "確認完成 · 去裝箱"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

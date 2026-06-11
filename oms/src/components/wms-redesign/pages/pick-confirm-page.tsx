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
//
// W6 — Direction A visual conformance: outboundSteps(0) stepper,
// solid 14px progress bar, item-row confirm columns with green tick
// circles, solid green completion banner, keycap in the dialog CTA.
// Logic untouched.

"use client";

import { ArrowRight, Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { ModeBadge } from "@/components/wms-redesign/mode-badge";
import { NextCTA } from "@/components/wms-redesign/next-cta";
import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { Stepper, outboundSteps } from "@/components/wms-redesign/stepper";
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

const TH = "px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.1em] text-wms-faint";

function statusPill(status: string) {
  if (status === "picking") return <Pill kind="warn">揀貨中</Pill>;
  if (status === "picked") return <Pill kind="ok">揀貨完成</Pill>;
  if (status === "draft") return <Pill kind="muted">建構中</Pill>;
  return <Pill kind="muted">{status}</Pill>;
}

function StepperStrip() {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-wms-border bg-wms-surface-alt px-4 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-wms-faint">
        出貨流程
      </span>
      <Stepper steps={outboundSteps(0)} />
    </div>
  );
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
      <StepperStrip />

      <div className="mb-4">
        <div className="flex items-center gap-3">
          <h1 className="font-wms-disp text-[24px] font-extrabold tracking-[0.01em]">
            揀貨完成確認
          </h1>
          <Pill kind="muted">紙本路徑</Pill>
        </div>
        <div className="mt-0.5 text-[12.5px] text-wms-muted">
          揀貨完成後返回 PC，逐件掃描 tracking 核實
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-wms-danger/30 bg-wms-danger-bg px-4 py-3 text-sm font-semibold text-wms-danger-fg">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
        <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
          <h3 className="font-wms-disp text-[13px] font-bold">揀貨中的批次</h3>
          <Pill kind="muted">{batches.length}</Pill>
          <span className="flex-1" />
          <span className="text-[11.5px] text-wms-faint">
            全部件掃描確認後自動標記 picked
          </span>
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-wms-border bg-wms-surface-alt">
              <th className={TH}>批次 #</th>
              <th className={TH}>出庫單數</th>
              <th className={TH}>啟動時間</th>
              <th className={TH}>狀態</th>
              <th className="px-3 py-2.5 text-right" />
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
                  暫無揀貨中的批次
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
                  <td className="px-3 py-2.5 font-wms-mono">
                    {b.outbound_ids?.length ?? 0}
                  </td>
                  <td className="px-3 py-2.5 font-wms-mono text-wms-muted">
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

  // 向上層 report 進度，讓 parent 渲染 NextCTA「下一步：去裝箱」
  React.useEffect(() => {
    onProgressChange?.({ allDone, picked, total });
  }, [allDone, picked, total, onProgressChange]);

  return (
    <div className="px-[22px] py-3.5">
      <StepperStrip />

      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-md border border-wms-border px-2.5 py-1 text-xs hover:bg-wms-row-hover"
        >
          ← 選擇其他批次
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-wms-disp text-[24px] font-extrabold tracking-[0.01em]">
              揀貨完成確認
            </h1>
            <span className="font-wms-mono text-sm text-wms-muted">
              {batchId}
            </span>
            {data && statusPill(data.batch_status)}
          </div>
          <div className="mt-0.5 text-[12.5px] text-wms-muted">
            紙本路徑 — 逐件掃描 tracking 核實
          </div>
        </div>
        <span className="flex-1" />
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-wms-danger/30 bg-wms-danger-bg px-4 py-3 text-sm font-semibold text-wms-danger-fg">
          {error}
        </div>
      )}

      <div className="mb-3.5">
        <Scanner
          placeholder="掃描已揀貨件條碼…"
          echo={lastEcho}
          disabled={busy || allDone}
          onScan={onScan}
        />
      </div>

      <div className="mb-3.5 flex items-center gap-3.5">
        <div className="h-[14px] flex-1 overflow-hidden border border-wms-border-strong bg-wms-surface-alt">
          <div
            className="h-full bg-wms-ok-strong transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-[14px] font-bold">
          <span className="font-wms-mono">
            {picked}/{total}
          </span>{" "}
          件已確認
        </span>
        {!allDone && total > 0 && (
          <Pill kind="warn-soft">尚有 {pending} 件未掃描</Pill>
        )}
      </div>

      {allDone && (
        <div className="mb-3.5 flex items-start gap-3.5 rounded-[4px] bg-wms-ok-strong px-[18px] py-3.5 text-white">
          <Check size={22} strokeWidth={2.5} className="mt-0.5 flex-none" />
          <div className="min-w-0 flex-1">
            <div className="font-wms-disp text-[17px] font-extrabold tracking-[0.01em]">
              批次全件已確認 ·{" "}
              <span className="font-wms-mono">
                {picked}/{total}
              </span>
            </div>
            <div className="mt-0.5 text-[12.5px] opacity-85">
              批次已自動標記 picked。按底欄「確認完成 ·
              去裝箱」推進至裝箱 — 確認後批次 closed，不可回頭。
            </div>
          </div>
        </div>
      )}
      {flash && (
        <div
          className={cn(
            "mb-3.5 rounded-lg px-4 py-2 text-sm font-semibold",
            flash.kind === "ok" &&
              "border border-wms-ok-fg/30 bg-wms-ok-bg text-wms-ok-fg",
            flash.kind === "warn" &&
              "border border-wms-warn-fg/30 bg-wms-warn-bg text-wms-warn-fg",
            flash.kind === "err" &&
              "border border-wms-danger/30 bg-wms-danger-bg text-wms-danger-fg"
          )}
        >
          {flash.text}
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1 overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
          <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
            <h3 className="font-wms-disp text-[13px] font-bold">未確認</h3>
            <Pill kind={pending > 0 ? "warn" : "ok"}>{pending}</Pill>
          </div>
          <div>
            {data?.items
              .filter((it) => it.status === "pending")
              .map((it) => (
                <div
                  key={it.inbound_id}
                  className="flex items-center gap-2.5 border-b border-wms-border px-3 py-2 text-[13px] last:border-b-0"
                >
                  {it.tracking_no.startsWith("YT") && <ModeBadge mode="yt" />}
                  <span className="font-wms-mono">{it.tracking_no}</span>
                  <span className="font-wms-mono text-[12px] text-wms-faint">
                    {it.outbound_short}
                  </span>
                  <span className="text-[12px] text-wms-faint">
                    {it.client_code ?? it.client_id.slice(-4).toUpperCase()}
                  </span>
                  <span className="ml-auto inline-flex items-center rounded-[4px] border-[1.5px] border-wms-border-strong bg-wms-surface px-2 py-[2px] font-wms-mono text-[12px] font-bold">
                    {it.locationCode ?? "—"}
                  </span>
                </div>
              ))}
            {pending === 0 && (
              <div className="px-3 py-6 text-center text-[13px] text-wms-faint">
                全部已確認
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
          <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
            <h3 className="font-wms-disp text-[13px] font-bold text-wms-ok-fg">
              已確認
            </h3>
            <Pill kind="ok">{picked}</Pill>
          </div>
          <div>
            {data?.items
              .filter((it) => it.status === "picked")
              .map((it) => (
                <div
                  key={it.inbound_id}
                  className="flex items-center gap-2.5 border-b border-wms-border px-3 py-2 text-[13px] opacity-75 last:border-b-0"
                >
                  <span className="inline-grid h-[17px] w-[17px] flex-none place-items-center rounded-full bg-wms-ok-strong text-[10.5px] font-extrabold text-white">
                    ✓
                  </span>
                  {it.tracking_no.startsWith("YT") && <ModeBadge mode="yt" />}
                  <span className="font-wms-mono">{it.tracking_no}</span>
                  <span className="font-wms-mono text-[12px] text-wms-faint">
                    {it.outbound_short}
                  </span>
                  <span className="text-[12px] text-wms-faint">
                    {it.client_code ?? it.client_id.slice(-4).toUpperCase()}
                  </span>
                </div>
              ))}
            {picked === 0 && (
              <div className="px-3 py-6 text-center text-[13px] text-wms-faint">
                尚未確認任何件
              </div>
            )}
          </div>
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

  // Reset progress 當切換至其他 batch / 或返回列表
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
                : `尚有 ${progress.total - progress.picked} 件未確認`
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
            批次 <strong className="font-wms-mono">{batchId}</strong> 全部 {progress.total} 件已確認。
            <br />
            <br />
            確認後批次將由 <strong>picked</strong> 推進至 <strong>closed</strong>(釋放揀貨站)，並前往裝箱頁面。closed 後不可再回頭加件。
            {completeError && (
              <span className="mt-3 block rounded-md border border-wms-danger/30 bg-wms-danger-bg px-3 py-2 text-wms-danger-fg">
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
            {completing ? (
              "處理中…"
            ) : (
              <>
                確認完成 · 去裝箱
                <span className="ml-1.5 rounded bg-white/20 px-1.5 font-wms-mono text-[11px]">
                  ↵
                </span>
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

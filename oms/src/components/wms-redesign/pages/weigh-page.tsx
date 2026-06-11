// P17 — handoff #weigh page.
//
// Renders the weigh-palletize state (left = active session / scanner /
// scale display, right = upcoming groups + completed). Constraint
// banner up top — the same-client-same-destination enforcement is
// already wired in services/outbound/weigh-palletize/actions.ts
// (scanBox throws on cross-group scan); this page surfaces it visually.
//
// Scale reading is intentionally a static display placeholder — real
// COM3 scale integration is browser-driver work, deferred.

"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Scale as ScaleIcon,
  Settings,
} from "lucide-react";
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

interface WeighQueueBox {
  box_no: string;
  weight_actual: number | null;
  weighed_at: string | null;
  status: "pending" | "weighed" | "scanned" | string;
}
interface WeighQueueEntry {
  outbound_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  shipment_type: "single" | "consolidated";
  outbound_status: string;
  boxes: WeighQueueBox[];
  /** 同當前 active session client + carrier + 收件地址 → 可加入同一組取單 */
  groupable_with_active?: boolean;
}
interface PalletizeQueueEntry extends WeighQueueEntry {
  box_count: number;
  total_weight_kg: number;
}
interface ActiveSession {
  outbound_id: string;
  outbound_ids: string[];
  client_id: string;
  client_code: string;
  client_name: string;
  locked_by: string;
  scanned_box_nos: string[];
  remaining_box_nos: string[];
  total: number;
  complete_ready: boolean;
}
interface State {
  weigh_queue: WeighQueueEntry[];
  palletize_queue: PalletizeQueueEntry[];
  active_session: ActiveSession | null;
}

const SYSTEM_CLIENT_ID = "SYS-YT";

function modeOf(g: { client_id: string; shipment_type: string }) {
  if (g.client_id === SYSTEM_CLIENT_ID) return "yt" as const;
  if (g.shipment_type === "single") return "single" as const;
  return "consolidated" as const;
}

// W6 — Direction A box chip: white face + 1.5px border + 17px status
// circle (solid green ✓ once weighed) + mono id + weight readout.
function BoxChip({
  box_no,
  weight,
  state,
}: {
  box_no: string;
  weight?: number | null;
  state: "weighed" | "current" | "queued" | "blocked";
}) {
  const done = state === "weighed";
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-[3px] border-[1.5px] px-2.5 py-1.5 text-[13px] font-semibold",
        done
          ? "border-wms-ok-strong bg-wms-ok-bg"
          : state === "current"
            ? "border-wms-warn-fg bg-wms-warn-bg"
            : state === "blocked"
              ? "border-wms-danger bg-wms-danger-bg"
              : "border-wms-border-strong bg-[#FAF9F7]"
      )}
    >
      <span
        className={cn(
          "inline-flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full text-[11px] font-extrabold",
          done
            ? "bg-wms-ok-strong text-white"
            : "bg-wms-surface-alt text-wms-faint"
        )}
      >
        {done ? "✓" : "·"}
      </span>
      <span className="font-wms-mono text-[12.5px]">{box_no}</span>
      {weight != null ? (
        <span className="font-wms-mono text-xs font-medium text-wms-ink-2">
          {weight.toFixed(2)} kg
        </span>
      ) : (
        !done && (
          <span className="text-xs font-normal text-wms-faint">待秤</span>
        )
      )}
      {state === "current" && (
        <span className="ml-auto rounded-[2px] bg-wms-warn-fg px-1.5 font-wms-mono text-[10.5px] text-white">
          秤重中
        </span>
      )}
    </div>
  );
}

function GroupCard({
  entry,
  highlighted,
  complete,
}: {
  entry: WeighQueueEntry | PalletizeQueueEntry;
  highlighted?: boolean;
  complete?: boolean;
}) {
  const mode = modeOf(entry);
  const weighed = (entry.boxes ?? []).filter(
    (b) => b.status === "weighed" || b.status === "scanned"
  ).length;
  const groupable = !!entry.groupable_with_active;
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        highlighted
          ? "border-2 border-wms-warn-fg bg-wms-warn-bg/40"
          : groupable
            ? "border-2 border-wms-ok-strong bg-wms-ok-bg/50"
            : "border-wms-border-strong bg-wms-surface",
        complete && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2.5">
        <ModeBadge mode={mode} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{entry.client_name}</span>
            <ArrowRight size={12} className="text-wms-faint" />
            <span className="text-[13px] font-medium">
              {entry.outbound_id}
            </span>
            {highlighted && <Pill kind="warn">進行中</Pill>}
            {groupable && !highlighted && !complete && (
              <Pill kind="ok">可加入當前組</Pill>
            )}
            {complete && (
              <Pill kind="ok">
                <Check size={11} strokeWidth={2.5} /> 已取單
              </Pill>
            )}
          </div>
          <div className="mt-0.5 text-xs text-wms-muted">
            {entry.boxes.length} 箱
            {"total_weight_kg" in entry && (
              <>
                {" "}
                · 累計{" "}
                <span className="font-wms-mono font-semibold text-wms-ink">
                  {entry.total_weight_kg.toFixed(2)}kg
                </span>
              </>
            )}
          </div>
        </div>
        <div
          className={cn(
            "rounded-md px-2.5 py-0.5 font-wms-mono text-[13px] font-semibold",
            highlighted
              ? "bg-wms-warn-fg text-white"
              : complete
                ? "bg-wms-ok-fg text-white"
                : "bg-wms-surface-alt text-wms-muted"
          )}
        >
          {weighed}/{entry.boxes.length}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {(entry.boxes ?? []).slice(0, 8).map((b) => (
          <BoxChip
            key={b.box_no}
            box_no={b.box_no}
            weight={b.weight_actual}
            state={
              b.status === "weighed" || b.status === "scanned"
                ? "weighed"
                : "queued"
            }
          />
        ))}
      </div>
    </div>
  );
}

export function WeighPageClient() {
  const [state, setState] = React.useState<State | null>(null);
  const [echo, setEcho] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // 掃描箱後尚未 confirm weigh 時暫存待秤的 box；
  // confirm 之後先 call save-box → scan-box → 入 session
  const [pendingBox, setPendingBox] = React.useState<string | null>(null);
  const [pendingWeight, setPendingWeight] = React.useState("");
  const [pendingDims, setPendingDims] = React.useState({ l: "", w: "", h: "" });
  const [tolerancePrompt, setTolerancePrompt] = React.useState<string | null>(
    null
  );

  const reload = React.useCallback(async () => {
    try {
      const res = await get_request("/api/wms/outbound/weigh-palletize/state");
      const json = await res.json();
      if (json?.status === 200) setState(json.data);
      else setError(json?.message ?? "Load failed");
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    }
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  // 掃箱：只 hold 入 pending 狀態，等倉庫員手動 input 重量
  const handleScan = (boxNo: string) => {
    setError(null);
    setTolerancePrompt(null);
    setEcho(boxNo);
    setPendingBox(boxNo);
    setPendingWeight("");
    setPendingDims({ l: "", w: "", h: "" });
  };

  // 確認重量：先 save-box 入磅 → 跟住 scan-box 入 palletize session
  const confirmWeigh = async (force = false) => {
    if (!pendingBox) return;
    setBusy(true);
    setError(null);
    try {
      const saveRes = await post_request(
        "/api/wms/outbound/weigh-palletize/save-box",
        {
          box_no: pendingBox,
          weight: Number(pendingWeight) || 0,
          length: Number(pendingDims.l) || 0,
          width: Number(pendingDims.w) || 0,
          height: Number(pendingDims.h) || 0,
          force,
        }
      );
      const saveJson = await saveRes.json();
      if (saveJson?.status !== 200) {
        // 超出 tolerance 且未 force → 彈出確認 prompt
        if (
          /tolerance|over|公斤|差異/i.test(saveJson?.message ?? "") &&
          !force
        ) {
          setTolerancePrompt(saveJson.message);
          return;
        }
        throw new Error(saveJson?.message ?? "Save weight failed");
      }
      // 接住 scan-box 入 session（同一個 box）
      const scanRes = await post_request(
        "/api/wms/outbound/weigh-palletize/scan-box",
        { box_no: pendingBox }
      );
      const scanJson = await scanRes.json();
      if (scanJson?.status !== 200) {
        throw new Error(scanJson?.message ?? "Palletize scan failed");
      }
      setPendingBox(null);
      setPendingWeight("");
      setPendingDims({ l: "", w: "", h: "" });
      setTolerancePrompt(null);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = () => {
    setPendingBox(null);
    setPendingWeight("");
    setPendingDims({ l: "", w: "", h: "" });
    setTolerancePrompt(null);
    setEcho(null);
  };

  // W5: label fetch result state — shown as a banner after complete
  const [labelResult, setLabelResult] = React.useState<{
    outcome: "obtained" | "batched" | "failed";
    outbound_ids: string[];
    error?: string;
  } | null>(null);

  const completeSession = async () => {
    if (!state?.active_session) return;
    setBusy(true);
    setError(null);
    setLabelResult(null);
    try {
      const res = await post_request(
        "/api/wms/outbound/weigh-palletize/complete",
        {}
      );
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Complete failed");
      }
      setEcho(null);
      setAutoCompleteOpen(false);

      // W5: auto-label fetch — backend already called carrier API during
      // completeSession. Check outcome and react accordingly.
      const data = json?.data ?? {};
      const outcome = data.label_fetch_outcome ?? "failed";
      const oids: string[] = data.outbound_ids ?? (data.outbound_id ? [data.outbound_id] : []);

      if (outcome === "obtained" || outcome === "batched") {
        // Success — open merged label PDF in new tab for immediate printing,
        // then advance to label_printed so orders go straight to depart.
        if (oids.length > 0) {
          const url = `/api/wms/outbound/labels-bundle?outbound_ids=${oids.join(",")}`;
          window.open(url, "_blank", "noopener,noreferrer");
          // W5: advance to label_printed → depart page
          try {
            await post_request("/api/wms/print/advance-to-printed", {
              outbound_ids: oids,
            });
          } catch { /* best-effort */ }
        }
        setLabelResult({ outcome, outbound_ids: oids });
      } else {
        // Failed — show error, user goes to label-print page to retry
        setLabelResult({
          outcome: "failed",
          outbound_ids: oids,
          error: data.label_fetch_error ?? "取單失敗",
        });
      }

      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setAutoCompleteOpen(false);
    } finally {
      setBusy(false);
    }
  };

  // Auto-popup：當前組全部箱掃描完成 (complete_ready) 且 weigh queue 沒有同組的其他箱
  // 可加入時 → 自動彈出 confirm dialog，倉庫員按 Enter 即取單，無需尋找按鈕。
  // 尚有同組箱可加入時刻意不彈出 — 讓倉庫員繼續掃描，session 自動 expand。
  const [autoCompleteOpen, setAutoCompleteOpen] = React.useState(false);
  const [autoCompleteDismissed, setAutoCompleteDismissed] = React.useState<string | null>(null);
  React.useEffect(() => {
    const sess = state?.active_session;
    if (!sess?.complete_ready) {
      setAutoCompleteDismissed(null);
      return;
    }
    const hasGroupable = (state?.weigh_queue ?? []).some(
      (e) => e.groupable_with_active
    );
    if (hasGroupable) return;
    // 用 session primary outbound_id 做 dedup key，避免同一 session reload 多次都重彈
    const key = sess.outbound_id;
    if (autoCompleteDismissed === key) return;
    setAutoCompleteOpen(true);
  }, [state?.active_session, state?.weigh_queue, autoCompleteDismissed]);

  const session = state?.active_session;
  const groupsRemaining =
    (state?.weigh_queue?.length ?? 0) + (state?.palletize_queue?.length ?? 0);
  const ctaState: "locked" | "ready" =
    groupsRemaining === 0 && session == null ? "ready" : "locked";

  return (
    <>
    <WmsShell
      crumbs={[{ label: "出貨作業" }, { label: "秤重取單" }]}
      cta={
        <NextCTA
          state={ctaState}
          to="weigh"
          progress={
            state
              ? {
                  done: state.palletize_queue.length,
                  total:
                    state.palletize_queue.length +
                    state.weigh_queue.length +
                    (session ? 1 : 0),
                }
              : undefined
          }
          lockedHint={
            groupsRemaining > 0
              ? `尚有 ${groupsRemaining} 組未取單（同客戶同目的地）`
              : undefined
          }
          back={{
            url: "/zh-hk/wms/operations/pack",
            label: "桌面裝箱",
          }}
          extras={
            ctaState === "ready" && (
              <a
                href="/zh-hk/wms/operations/label-print"
                className="inline-flex items-center gap-1.5 rounded-[3px] border-[1.5px] border-wms-danger bg-transparent px-4 py-2.5 text-[13px] font-bold text-[#ff9a8d] hover:bg-wms-danger/10"
              >
                重試運單
              </a>
            )
          }
        />
      }
    >
      <div className="px-[22px] py-3.5">
        <div className="mb-3.5 flex items-end gap-3">
          <div>
            <h1 className="font-wms-disp text-[24px] font-extrabold tracking-[0.01em]">
              秤重取單
            </h1>
            <div className="mt-0.5 text-[12.5px] text-wms-muted">
              Session 鎖定 · 同客戶＋同目的地一組取單 · {state?.weigh_queue?.length ?? 0} 組待秤 · {session ? "1" : "0"} 組進行中
            </div>
          </div>
          <span className="flex-1" />
          <Stepper steps={outboundSteps(2)} />
          <button className="inline-flex items-center gap-1.5 rounded-[3px] border border-wms-border-strong bg-wms-surface px-2.5 py-1.5 text-xs font-semibold hover:bg-wms-row-hover">
            <Settings size={13} /> 磅秤設定
          </button>
        </div>

        <div className="mb-3 flex items-start gap-3 rounded-[10px] bg-wms-brand-soft px-4 py-3 text-[13px] text-wms-brand">
          <AlertTriangle size={18} className="mt-px flex-none" />
          <div>
            <strong>連續掃描規則</strong> ·
            同客戶同目的地的箱必須連續掃描，不可中途插入其他客戶／目的地的箱。掃描到不同組會即時停止 — 完成當前組「取單」後方可開始下一組。
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-3 py-2 text-sm text-wms-danger-fg">
            {error}
          </div>
        )}

        {/* W5: label fetch result banner after completeSession */}
        {labelResult && (
          <div
            className={cn(
              "mb-3 rounded-[4px] p-4 text-white",
              labelResult.outcome === "failed"
                ? "bg-wms-danger"
                : "bg-wms-ok-strong"
            )}
          >
            {labelResult.outcome === "failed" ? (
              <div className="flex items-start gap-3">
                <AlertTriangle size={22} className="mt-0.5 flex-none" />
                <div className="flex-1">
                  <div className="font-wms-disp text-[17px] font-extrabold">
                    取單失敗
                  </div>
                  <div className="mt-1 text-[12.5px] opacity-90">
                    {labelResult.error}
                  </div>
                  <div className="mt-0.5 text-[12px] opacity-75">
                    出庫單已移入「重印面單」頁面，請前往重試取單。
                  </div>
                </div>
                <a
                  href="/zh-hk/wms/operations/label-print"
                  className="flex-none rounded-[3px] bg-white px-4 py-2 text-[13px] font-bold text-wms-danger hover:brightness-95"
                >
                  前往重印面單 →
                </a>
                <button
                  onClick={() => setLabelResult(null)}
                  className="text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <Check size={22} className="mt-0.5 flex-none" strokeWidth={2.5} />
                <div className="flex-1">
                  <div className="font-wms-disp text-[17px] font-extrabold">
                    取單成功 · 面單已彈出列印
                  </div>
                  <div className="mt-1 text-[12.5px] opacity-90">
                    {labelResult.outbound_ids.length} 張出庫單已取得面單 — 即印即貼。若未彈出新視窗，請允許彈出式視窗後
                    <button
                      onClick={() => {
                        const url = `/api/wms/outbound/labels-bundle?outbound_ids=${labelResult.outbound_ids.join(",")}`;
                        window.open(url, "_blank", "noopener,noreferrer");
                      }}
                      className="mx-1 font-bold underline"
                    >
                      再印一次
                    </button>
                    。訂單已進入離站佇列。
                  </div>
                </div>
                <button
                  onClick={() => setLabelResult(null)}
                  className="text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex flex-[1.7] flex-col gap-3">
            <Scanner
              placeholder={
                session
                  ? `掃描下一箱 · 必須屬於 ${session.client_name}`
                  : "掃描箱上條碼開始／加入秤重組…"
              }
              echo={echo ?? undefined}
              onScan={handleScan}
            />

            {/* Scale / weigh input */}
            <div className="overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
              <div className="flex items-center gap-2 border-b border-wms-border bg-wms-surface-alt px-3.5 py-2.5">
                <ScaleIcon size={15} />
                <span className="text-[13px] font-semibold">
                  {pendingBox
                    ? `輸入重量 · ${pendingBox}`
                    : session
                      ? `秤重中 · ${session.outbound_id}`
                      : "等待掃描箱"}
                </span>
                <span className="flex-1" />
                <Pill kind="muted">手動輸入（磅秤未連接）</Pill>
              </div>

              {pendingBox ? (
                // 手動輸入重量區（COM3 磅秤未連接時的 fallback UI）
                <div className="p-4">
                  <div className="mb-3 grid grid-cols-4 gap-2.5">
                    <label className="rounded-[10px] border-2 border-wms-brand bg-wms-brand-soft p-2.5">
                      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-wms-brand">
                        重量 (kg)
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        value={pendingWeight}
                        onChange={(e) => setPendingWeight(e.target.value)}
                        autoFocus
                        placeholder="例: 4.20"
                        className="w-full border-0 bg-transparent font-wms-mono text-2xl font-bold outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmWeigh();
                        }}
                      />
                    </label>
                    <label className="rounded-[10px] border border-wms-border bg-wms-surface-alt p-2.5">
                      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-wms-faint">
                        L (cm)
                      </div>
                      <input
                        type="number"
                        value={pendingDims.l}
                        onChange={(e) =>
                          setPendingDims((d) => ({ ...d, l: e.target.value }))
                        }
                        placeholder="0"
                        className="w-full border-0 bg-transparent font-wms-mono text-lg font-semibold outline-none"
                      />
                    </label>
                    <label className="rounded-[10px] border border-wms-border bg-wms-surface-alt p-2.5">
                      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-wms-faint">
                        W (cm)
                      </div>
                      <input
                        type="number"
                        value={pendingDims.w}
                        onChange={(e) =>
                          setPendingDims((d) => ({ ...d, w: e.target.value }))
                        }
                        placeholder="0"
                        className="w-full border-0 bg-transparent font-wms-mono text-lg font-semibold outline-none"
                      />
                    </label>
                    <label className="rounded-[10px] border border-wms-border bg-wms-surface-alt p-2.5">
                      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-wms-faint">
                        H (cm)
                      </div>
                      <input
                        type="number"
                        value={pendingDims.h}
                        onChange={(e) =>
                          setPendingDims((d) => ({ ...d, h: e.target.value }))
                        }
                        placeholder="0"
                        className="w-full border-0 bg-transparent font-wms-mono text-lg font-semibold outline-none"
                      />
                    </label>
                  </div>
                  {tolerancePrompt && (
                    <div className="mb-3 rounded-lg border border-wms-warn-fg/30 bg-wms-warn-bg px-3 py-2 text-[13px] text-wms-warn-fg">
                      ⚠️ {tolerancePrompt} — 按「確認重量（強制）」覆蓋
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => confirmWeigh(!!tolerancePrompt)}
                      disabled={busy || !pendingWeight}
                      className="inline-flex items-center gap-2 rounded-lg bg-wms-ink px-5 py-2.5 text-[14px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
                    >
                      <Check size={15} strokeWidth={2.5} />
                      {tolerancePrompt ? "確認重量（強制）· ↵" : "確認重量並加入秤重組 · ↵"}
                    </button>
                    <button
                      onClick={cancelPending}
                      className="rounded-lg border border-wms-border bg-wms-surface px-4 py-2.5 text-[13px] hover:bg-wms-row-hover"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-5 p-5">
                  <div className="w-[280px] rounded-xl bg-wms-ink px-5 py-4 text-center text-white">
                    <div className="text-[10.5px] font-medium uppercase tracking-widest text-[#94A3B8]">
                      SCALE · LIVE
                    </div>
                    <div className="my-1 font-wms-mono text-[56px] font-semibold leading-none tracking-tight text-[#86EFAC]">
                      —
                      <span className="ml-1 text-[22px] text-[#94A3B8]">kg</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-[#94A3B8]">
                      <span>±0.02</span>
                      <span>● 待連接</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    {session ? (
                      <>
                        <div className="font-wms-mono text-lg font-semibold">
                          {session.scanned_box_nos.at(-1) ?? "—"}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-wms-muted">
                          <span>{session.client_name}</span>
                          <ArrowRight size={11} />
                          <span>
                            {session.outbound_ids.join(", ").slice(0, 60)}
                          </span>
                        </div>
                        <div className="mt-2.5 flex gap-3 text-xs">
                          <div>
                            <div className="text-[11px] text-wms-faint">
                              已掃 / 總
                            </div>
                            <div className="font-wms-mono text-sm font-semibold">
                              {session.scanned_box_nos.length} / {session.total}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-wms-faint">
                        掃描箱上條碼 → 輸入重量 → 自動加入秤重組
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Current group */}
            {session && (
              <div className="rounded-xl border-2 border-wms-ink bg-wms-surface p-3.5">
                <div className="mb-3 flex items-center gap-2.5">
                  <ModeBadge
                    mode={
                      session.client_id === SYSTEM_CLIENT_ID
                        ? "yt"
                        : "consolidated"
                    }
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold">
                        {session.client_name}
                      </span>
                      <ArrowRight size={12} className="text-wms-faint" />
                      <span className="text-sm font-medium">
                        {session.outbound_ids.length} 張出庫單
                      </span>
                      <Pill kind="warn">當前秤重組</Pill>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-wms-mono text-[22px] font-semibold leading-none text-wms-warn-fg">
                      {session.scanned_box_nos.length}/{session.total}
                    </div>
                    <div className="text-[11px] text-wms-muted">箱已秤</div>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {session.scanned_box_nos.map((no) => (
                    <BoxChip key={no} box_no={no} state="weighed" />
                  ))}
                  {session.remaining_box_nos.map((no) => (
                    <BoxChip key={no} box_no={no} state="queued" />
                  ))}
                </div>
                <div className="flex items-center gap-2.5 border-t border-wms-border pt-2.5">
                  <span className="text-xs text-wms-muted">
                    {session.complete_ready
                      ? "全部秤重完成，可取單"
                      : `尚有 ${session.remaining_box_nos.length} 箱待秤`}
                  </span>
                  <span className="flex-1" />
                  <button
                    onClick={completeSession}
                    disabled={!session.complete_ready || busy}
                    className="inline-flex items-center gap-2 rounded-[3px] bg-wms-ok-strong px-4 py-2 font-wms-disp text-sm font-extrabold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    完成點箱並取單
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <h3 className="font-wms-disp text-[12.5px] font-bold tracking-[0.08em] text-wms-ink-2">下一輪 · 等待秤重</h3>
              <span className="flex-1" />
              <Pill kind="muted">
                {state?.weigh_queue?.length ?? 0} 組
              </Pill>
            </div>
            {state?.weigh_queue?.length === 0 && (
              <div className="rounded-md bg-wms-surface-alt p-3 text-center text-xs text-wms-faint">
                佇列已空
              </div>
            )}
            {(state?.weigh_queue ?? []).slice(0, 8).map((g) => (
              <GroupCard key={g.outbound_id} entry={g} />
            ))}

            <div className="mt-2 flex items-center gap-2">
              <h3 className="font-wms-disp text-[12.5px] font-bold tracking-[0.08em] text-wms-ink-2">已取單 · 待出貨</h3>
              <span className="flex-1" />
              <Pill kind="ok">
                {state?.palletize_queue?.length ?? 0} 組
              </Pill>
            </div>
            {(state?.palletize_queue ?? []).slice(0, 5).map((g) => (
              <GroupCard key={g.outbound_id} entry={g} complete />
            ))}
          </div>
        </div>
      </div>
    </WmsShell>
    <AlertDialog
      open={autoCompleteOpen}
      onOpenChange={(open) => {
        if (!open && session?.outbound_id) {
          // 倉庫員手動關 dialog（cancel）— mark dismissed 避免下一次 reload 又彈
          setAutoCompleteDismissed(session.outbound_id);
        }
        setAutoCompleteOpen(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {session?.client_name} 已沒有其他同組箱
          </AlertDialogTitle>
          <AlertDialogDescription>
            當前組 {session?.outbound_ids?.length ?? 1} 張出庫單 · 共 {session?.total ?? 0} 箱已全部秤重及點箱完成。
            倉庫已沒有同客戶／同目的地的其他箱可加入此組。
            <br />
            <br />
            按 <strong>Enter</strong> 或點擊確認即直接取單。系統會自動呼叫 carrier API 取得面單，成功後會立即彈出 PDF 供列印。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>暫緩 · 稍後處理</AlertDialogCancel>
          <AlertDialogAction
            autoFocus
            onClick={(e) => {
              e.preventDefault();
              completeSession();
            }}
            disabled={busy}
          >
            {busy ? "處理中…" : "確認取單 · ↵"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

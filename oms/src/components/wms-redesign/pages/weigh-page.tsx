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
import { Stepper } from "@/components/wms-redesign/stepper";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
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

const STEPPER = [
  { label: "揀貨", state: "done" as const },
  { label: "裝箱", state: "done" as const },
  { label: "秤重取單", state: "current" as const },
  { label: "印單", state: "todo" as const },
  { label: "離站", state: "todo" as const },
];

const SYSTEM_CLIENT_ID = "SYS-YT";

function modeOf(g: { client_id: string; shipment_type: string }) {
  if (g.client_id === SYSTEM_CLIENT_ID) return "yt" as const;
  if (g.shipment_type === "single") return "single" as const;
  return "consolidated" as const;
}

function BoxChip({
  box_no,
  weight,
  state,
}: {
  box_no: string;
  weight?: number | null;
  state: "weighed" | "current" | "queued" | "blocked";
}) {
  const map: Record<typeof state, string> = {
    weighed: "bg-wms-ok-bg text-wms-ok-fg border-wms-ok-fg/40",
    current: "bg-wms-warn-bg text-wms-warn-fg border-wms-warn-fg",
    queued: "bg-wms-surface text-wms-ink border-wms-border",
    blocked: "bg-wms-danger-bg text-wms-danger-fg border-wms-danger-fg",
  } as const;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2",
        map[state]
      )}
    >
      <div className="min-w-[70px] font-wms-mono text-[12.5px] font-semibold">
        {box_no}
      </div>
      {weight != null && (
        <div className="font-wms-mono text-xs font-medium">
          {weight.toFixed(2)}kg
        </div>
      )}
      {state === "weighed" && <Check size={13} strokeWidth={2.5} />}
      {state === "current" && (
        <span className="ml-auto rounded bg-wms-warn-fg px-1.5 font-wms-mono text-[10.5px] text-white">
          秤緊
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
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        highlighted ? "border-2 border-wms-warn-fg bg-[#FFFBEB]" : "border-wms-border bg-wms-surface",
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

  const handleScan = async (boxNo: string) => {
    setError(null);
    setBusy(true);
    try {
      const res = await post_request(
        "/api/wms/outbound/weigh-palletize/scan-box",
        { box_no: boxNo }
      );
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Scan failed");
      }
      setEcho(boxNo);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const completeSession = async () => {
    if (!state?.active_session) return;
    setBusy(true);
    setError(null);
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
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const session = state?.active_session;
  const groupsRemaining =
    (state?.weigh_queue?.length ?? 0) + (state?.palletize_queue?.length ?? 0);
  const ctaState: "locked" | "ready" =
    groupsRemaining === 0 && session == null ? "ready" : "locked";

  return (
    <WmsShell
      crumbs={[{ label: "出貨作業" }, { label: "秤重取單" }]}
      cta={
        <NextCTA
          state={ctaState}
          to="print"
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
              ? `仲有 ${groupsRemaining} 組未取單 (同客同目的地)`
              : undefined
          }
          back={{
            url: "/zh-hk/wms/operations/pack",
            label: "裝箱任務",
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
          <span className="flex-1" />
          <Pill kind="info">集運流程</Pill>
        </div>

        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">秤重取單</h1>
          <Pill kind="muted">
            {state?.weigh_queue?.length ?? 0} 組待秤 ·{" "}
            {session ? "1" : "0"} 組進行中
          </Pill>
          <span className="flex-1" />
          <button className="inline-flex items-center gap-1.5 rounded-md border border-wms-border bg-wms-surface px-2.5 py-1 text-xs hover:bg-wms-row-hover">
            <Settings size={13} /> 磅秤設定
          </button>
        </div>

        <div className="mb-3 flex items-start gap-3 rounded-[10px] bg-wms-brand-soft px-4 py-3 text-[13px] text-wms-brand">
          <AlertTriangle size={18} className="mt-px flex-none" />
          <div>
            <strong>連續掃描規則</strong> ·
            同客戶同目的地嘅箱必須一齊掃描，唔可以中間插另一個客戶 / 另一個目的地嘅箱。掃到唔同組會即時停止 — 完成當前組「取單」之後先可以開下一組。
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-3 py-2 text-sm text-wms-danger-fg">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex flex-[1.7] flex-col gap-3">
            <Scanner
              placeholder={
                session
                  ? `掃下一箱 · 必須係 ${session.client_name}`
                  : "掃箱 barcode 開始 session…"
              }
              echo={echo ?? undefined}
              onScan={handleScan}
            />

            {/* Scale display */}
            <div className="overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
              <div className="flex items-center gap-2 border-b border-wms-border bg-wms-surface-alt px-3.5 py-2.5">
                <ScaleIcon size={15} />
                <span className="text-[13px] font-semibold">
                  {session
                    ? `正喺度秤 · ${session.outbound_id}`
                    : "等候 box scan"}
                </span>
                <span className="flex-1" />
                <Pill kind="muted">磅秤連接中</Pill>
              </div>
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
                      掃任何箱 barcode 開始新 session
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Current group */}
            {session && (
              <div className="rounded-xl border-2 border-wms-warn-fg/40 bg-[#FFFBEB] p-3.5">
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
                        {session.outbound_ids.length} 張 outbound
                      </span>
                      <Pill kind="warn">當前組</Pill>
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
                <div className="flex items-center gap-2.5 border-t border-wms-warn-fg/30 pt-2.5">
                  <span className="text-xs text-wms-muted">
                    {session.complete_ready
                      ? "全部秤完，可取單"
                      : `仲有 ${session.remaining_box_nos.length} 箱要秤`}
                  </span>
                  <span className="flex-1" />
                  <button
                    onClick={completeSession}
                    disabled={!session.complete_ready || busy}
                    className="inline-flex items-center gap-2 rounded-lg bg-wms-ink px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    完成點箱並取單
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold">下一輪 · 等緊秤</h3>
              <span className="flex-1" />
              <Pill kind="muted">
                {state?.weigh_queue?.length ?? 0} 組
              </Pill>
            </div>
            {state?.weigh_queue?.length === 0 && (
              <div className="rounded-md bg-wms-surface-alt p-3 text-center text-xs text-wms-faint">
                queue 已空
              </div>
            )}
            {(state?.weigh_queue ?? []).slice(0, 8).map((g) => (
              <GroupCard key={g.outbound_id} entry={g} />
            ))}

            <div className="mt-2 flex items-center gap-2">
              <h3 className="text-[13px] font-semibold">已取單 · 待出貨</h3>
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
  );
}

// P17 — handoff #depart page (dual-scan).
//
// Flow:
//   1. user scans box label  → step 1 confirmed locally
//   2. user scans 3PL label  → POST /api/wms/outbound/depart-double-scan;
//      server matches box.tracking_no === scanned label, departs box.
//
// All matching enforcement lives on the server (see
// services/outbound/double-scan-depart.ts) — this page only sequences
// the two scans and shows the green-tick paired UI on success.

"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Home,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { ModeBadge, type Mode } from "@/components/wms-redesign/mode-badge";
import { NextCTA } from "@/components/wms-redesign/next-cta";
import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { Stepper } from "@/components/wms-redesign/stepper";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { get_request, post_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";

const SYSTEM_CLIENT_ID = "SYS-YT";

interface DepartableOutbound {
  _id: string;
  client_id: string;
  carrier_code: string;
  destination_country: string;
  shipment_type: "consolidated" | "single";
  is_yt?: boolean;
  boxes: { box_no: string; status: string }[];
}

interface FlatBox {
  box_no: string;
  outbound_id: string;
  client_id: string;
  mode: Mode;
  carrier_code: string;
  destination_country: string;
  status: string;
}

const STEPPER = [
  { label: "揀貨", state: "done" as const },
  { label: "裝箱", state: "done" as const },
  { label: "秤重取單", state: "done" as const },
  { label: "印單", state: "done" as const },
  { label: "離站", state: "current" as const },
];

function modeOf(o: { client_id: string; shipment_type: string; is_yt?: boolean }): Mode {
  if (o.is_yt || o.client_id === SYSTEM_CLIENT_ID) return "yt";
  if (o.shipment_type === "single") return "single";
  return "consolidated";
}

export function DepartPageClient() {
  const router = useRouter();
  const [outbounds, setOutbounds] = React.useState<DepartableOutbound[]>([]);
  const [scannedBox, setScannedBox] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [departedNow, setDepartedNow] = React.useState<Map<string, string>>(
    new Map()
  );

  const reload = React.useCallback(async () => {
    try {
      const res = await get_request("/api/wms/outbound/departable");
      const json = await res.json();
      if (json?.status === 200) setOutbounds(json.data ?? []);
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
    const id = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const flatBoxes: FlatBox[] = React.useMemo(() => {
    const out: FlatBox[] = [];
    for (const ob of outbounds) {
      const mode = modeOf(ob);
      for (const b of ob.boxes) {
        out.push({
          box_no: b.box_no,
          outbound_id: ob._id,
          client_id: ob.client_id,
          mode,
          carrier_code: ob.carrier_code,
          destination_country: ob.destination_country,
          status: b.status,
        });
      }
    }
    return out;
  }, [outbounds]);

  const total = flatBoxes.length;
  // local "departed in this session" + server-side departed status from
  // outbound boxes (status === "departed") for the table.
  const isDeparted = (boxNo: string) => departedNow.has(boxNo);

  const currentBox = React.useMemo(() => {
    if (!scannedBox) return null;
    return flatBoxes.find((b) => b.box_no === scannedBox) ?? null;
  }, [scannedBox, flatBoxes]);

  // W5: only count departed boxes that are still in the current flatBoxes list,
  // so departed outbounds that dropped off the departable query don't inflate the count.
  const doneCount = flatBoxes.filter((b) => departedNow.has(b.box_no) || b.status === "departed").length;
  const allDone = total > 0 && doneCount >= total;

  const handleScanBox = (v: string) => {
    setError(null);
    setScannedBox(v);
  };

  const handleScanLabel = async (v: string) => {
    if (!scannedBox) {
      setError("先掃箱 label (STEP 1)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await post_request(
        "/api/wms/outbound/depart-double-scan",
        { box_no: scannedBox, third_party_label: v }
      );
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Depart failed");
      }
      const t = new Date();
      const time = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
      setDepartedNow((prev) => {
        const next = new Map(prev);
        next.set(scannedBox, time);
        return next;
      });
      setToast(`${scannedBox} 已離站 · 配對成功`);
      setScannedBox(null);
      // Reload to pull next batch / status updates.
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const resetCurrent = () => {
    setScannedBox(null);
    setError(null);
  };

  return (
    <WmsShell
      crumbs={[{ label: "出貨作業" }, { label: "離站掃描" }]}
      cta={
        <NextCTA
          state={allDone ? "ready" : "locked"}
          to={null}
          label="流程完成 · 返工作台"
          progress={{ done: doneCount, total }}
          lockedHint={
            !allDone && total > 0
              ? `仲有 ${total - doneCount} 個箱未配對`
              : total === 0
                ? "今日無箱要離站"
                : undefined
          }
          back={{
            url: "/zh-hk/wms/operations/label-print",
            label: "印單 · 攬收",
          }}
          extras={
            allDone && (
              <button
                onClick={() => router.push("/zh-hk/wms")}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-wms-ink bg-wms-ink px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
              >
                <Home size={14} /> 返工作台
              </button>
            )
          }
        />
      }
    >
      <div className="px-[22px] py-3.5">
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-wms-border bg-wms-surface-alt px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-wms-faint">
            出貨流程
          </span>
          <Stepper steps={STEPPER} />
        </div>

        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">離站掃描</h1>
          <Pill kind="muted">
            {doneCount}/{total} 已離站
          </Pill>
          <span className="flex-1" />
          <button
            onClick={resetCurrent}
            className="rounded-md border border-wms-border bg-wms-surface px-2.5 py-1 text-xs hover:bg-wms-row-hover"
          >
            重置當前掃描
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-3 py-2 text-sm text-wms-danger-fg">
            <AlertTriangle size={14} className="-mt-px mr-1 inline" />
            {error}
          </div>
        )}

        {!allDone && total > 0 && (
          <div className="mb-3 rounded-xl border-[1.5px] border-wms-warn-fg/40 bg-[#FEFCE8] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Pill kind="warn">
                <Zap size={11} strokeWidth={2.5} /> 配對中
              </Pill>
              <span className="text-sm font-semibold">
                {scannedBox ? `當前箱 · ${scannedBox}` : "等掃下一箱"}
              </span>
              {currentBox && <ModeBadge mode={currentBox.mode} />}
              <span className="flex-1" />
              <span className="text-[11px] text-wms-faint">
                掃完兩個 label 自動配對
              </span>
            </div>

            <div className="flex items-center gap-3.5">
              {/* STEP 1 */}
              <div
                className={cn(
                  "flex-1 rounded-xl border-2 p-4",
                  scannedBox
                    ? "border-wms-ok-fg bg-[#F0FDF4]"
                    : "border-wms-ink bg-white"
                )}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "font-wms-mono text-[10px] font-semibold tracking-widest",
                      scannedBox ? "text-wms-ok-fg" : "text-wms-muted"
                    )}
                  >
                    STEP 1
                  </span>
                  <span className="text-[13px] font-semibold">箱 label</span>
                  {scannedBox && (
                    <Pill kind="ok">
                      <Check size={11} strokeWidth={2.5} /> 已掃
                    </Pill>
                  )}
                </div>
                <div className="mb-1 font-wms-mono text-[22px] font-semibold">
                  {scannedBox ?? "_ _ _ - _ _ _ _"}
                </div>
                <Scanner
                  placeholder="掃箱外 ShipItAsia barcode"
                  onScan={handleScanBox}
                  autoFocus={!scannedBox}
                />
              </div>

              {/* link */}
              <div className="flex flex-col items-center gap-1">
                <span className="font-wms-mono text-[10px] uppercase tracking-wider text-wms-muted">
                  配 對
                </span>
                <svg width={60} height={30} viewBox="0 0 60 30">
                  <path
                    d="M 4 15 L 56 15"
                    stroke={scannedBox ? "#15803D" : "#D4D4D8"}
                    strokeWidth={2}
                    strokeDasharray={scannedBox ? "0" : "6 4"}
                    strokeLinecap="round"
                  />
                  <path
                    d="M 50 9 L 56 15 L 50 21"
                    fill="none"
                    stroke={scannedBox ? "#15803D" : "#D4D4D8"}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* STEP 2 */}
              <div
                className={cn(
                  "flex-1 rounded-xl border-2 p-4",
                  scannedBox
                    ? "border-wms-ink bg-white"
                    : "border-wms-border-strong bg-wms-surface-alt opacity-60"
                )}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="font-wms-mono text-[10px] font-semibold uppercase tracking-widest text-wms-muted">
                    STEP 2
                  </span>
                  <span className="text-[13px] font-semibold">3PL label</span>
                </div>
                <div className="mb-1 font-wms-mono text-lg font-semibold">
                  {scannedBox ? "等掃…" : "等 step 1"}
                </div>
                <Scanner
                  placeholder={
                    scannedBox
                      ? "掃 courier 嗰張運單條碼"
                      : "上一步未完成"
                  }
                  onScan={handleScanLabel}
                  disabled={!scannedBox || busy}
                  autoFocus={!!scannedBox}
                />
              </div>
            </div>

            <div className="mt-3.5 flex items-center gap-2.5 rounded-lg border border-dashed border-wms-border-strong bg-white px-3 py-2 text-xs text-wms-muted">
              <AlertTriangle size={14} />
              <span className="flex-1">
                <strong className="text-wms-ink">規則:</strong>{" "}
                兩個 label 必須屬同一箱；掃錯 = 系統即時拒絕並要重掃。
              </span>
              <span className="font-wms-mono text-[11px]">
                {doneCount} / {total}
              </span>
            </div>
          </div>
        )}

        {allDone && (
          <div
            className="mb-3 rounded-xl border p-7 text-center"
            style={{
              background:
                "linear-gradient(135deg, #DCFCE7 0%, #F0FDF4 100%)",
              borderColor: "rgba(21, 128, 61, 0.4)",
            }}
          >
            <div className="mx-auto mb-3 flex h-16 w-16 animate-wms-done-pop items-center justify-center rounded-full bg-wms-ok-fg text-white">
              <Check size={36} strokeWidth={3} />
            </div>
            <h2 className="mb-1.5 text-2xl font-semibold text-wms-ok-fg">
              今日所有箱都已離站
            </h2>
            <div className="mb-2 text-[13.5px] text-wms-ok-fg/85">
              {total} 個箱配對成功 · 出貨流程完成
            </div>
            <div className="text-xs text-wms-ok-fg/75">
              攬收已喺上一步 (印單頁) 安排妥 · 等 courier 到倉走貨即可
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
          <div className="flex items-center gap-2 border-b border-wms-border px-3.5 py-2.5">
            <h3 className="text-sm font-semibold">今日箱清單</h3>
            <Pill kind="muted">{total} 個</Pill>
            <span className="flex-1" />
            <span className="text-[11px] text-wms-muted">進度</span>
            <div className="h-1.5 w-24 overflow-hidden rounded bg-wms-surface-alt">
              <div
                className="h-full bg-wms-ok-fg transition-all"
                style={{ width: `${total === 0 ? 0 : (doneCount / total) * 100}%` }}
              />
            </div>
            <span className="font-wms-mono text-[11.5px] font-semibold">
              {doneCount}/{total}
            </span>
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-wms-border bg-wms-surface-alt text-[11.5px] text-wms-muted">
                <th className="w-8 px-3 py-2.5" />
                <th className="px-3 py-2.5 text-left font-medium">Box #</th>
                <th className="px-3 py-2.5 text-left font-medium">模式</th>
                <th className="px-3 py-2.5 text-left font-medium">Outbound · 目的地</th>
                <th className="px-3 py-2.5 text-left font-medium">Carrier</th>
                <th className="px-3 py-2.5 text-left font-medium">狀態</th>
              </tr>
            </thead>
            <tbody>
              {flatBoxes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-wms-faint">
                    無待離站箱
                  </td>
                </tr>
              )}
              {flatBoxes.map((b) => {
                const done = isDeparted(b.box_no) || b.status === "departed";
                const isCur = scannedBox === b.box_no;
                return (
                  <tr
                    key={b.box_no}
                    className={cn(
                      done
                        ? "bg-[#F0FDF4]"
                        : isCur
                          ? "bg-[#FEFCE8]"
                          : ""
                    )}
                  >
                    <td className="px-3 py-2.5">
                      {done ? (
                        <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-wms-ok-fg text-white">
                          <Check size={13} strokeWidth={2.5} />
                        </span>
                      ) : isCur ? (
                        <span className="inline-flex h-[22px] w-[22px] animate-wms-blink items-center justify-center rounded-full bg-wms-warn-fg text-white">
                          <Zap size={12} strokeWidth={2.5} />
                        </span>
                      ) : (
                        <span className="inline-block h-[22px] w-[22px] rounded-full border-[1.5px] border-wms-border-strong" />
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-wms-mono font-semibold">
                      {b.box_no}
                    </td>
                    <td className="px-3 py-2.5">
                      <ModeBadge mode={b.mode} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-wms-mono text-[12.5px]">
                        {b.outbound_id}
                      </div>
                      <div className="text-[11.5px] text-wms-muted">
                        {b.destination_country}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-wms-mono text-wms-muted">
                      {b.carrier_code}
                    </td>
                    <td className="px-3 py-2.5">
                      {done ? (
                        <Pill kind="ok">
                          <Check size={11} strokeWidth={2.5} /> 已離站{" "}
                          {departedNow.get(b.box_no) ?? ""}
                        </Pill>
                      ) : isCur ? (
                        <Pill kind="warn">配對中…</Pill>
                      ) : (
                        <Pill kind="muted">等掃</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {toast && (
          <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-wms-ink px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
            <Check size={14} className="-mt-px mr-1 inline" strokeWidth={2.5} />
            {toast}
          </div>
        )}
      </div>
    </WmsShell>
  );
}

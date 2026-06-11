// P17 — desktop "到倉掃描" actionable form.
//
// W1 (2026-05-22): previously a read-only monitor that punted everything
// to the PDA. Floor managers / supervisors now do real arrivals from a
// PC + USB scanner too, so this page mirrors the PDA arrive loop:
//
//   1. Scanner-bar Enter triggers POST /api/wms/scan/arrive
//   2. Result classified into forecasted | yt | unclaimed buckets
//      (matched=true → forecasted; matched=false → isYTTracking gate)
//   3. Banner shows the bucket + a "下一步" link
//   4. Last 5 scans rendered as an in-memory history list
//
// W5: unmatched (non-YT) scans now auto-call /scan/arrive/unclaimed-quick
// to create the unclaimed_inbounds record immediately. Users expect the
// parcel to appear in the "無頭件指派" page right after scanning.
//
// W6 — Direction A visual conformance: solid signage banners, header
// tally strip (derived from the in-memory scan list, purely visual),
// disp h1 + mono ids. Routing / fetch logic unchanged.

"use client";

import { AlertTriangle, PackageCheck, Truck } from "lucide-react";
import * as React from "react";

import { ModeBadge } from "@/components/wms-redesign/mode-badge";
import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { Stepper } from "@/components/wms-redesign/stepper";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { cn } from "@/lib/utils";

type Bucket = "forecasted" | "yt" | "unclaimed";

interface ArriveResponseData {
  matched?: boolean;
  scan_id?: string;
  inbound_id?: string;
  status?: string;
}

interface ScanRow {
  id: string; // local list key
  ts: number;
  trackingNo: string;
  bucket: Bucket;
  inboundId?: string;
  scanId?: string;
  error?: string;
}

const MAX_HISTORY = 5;

function isYTTrackingClient(s: string): boolean {
  return typeof s === "string" && s.trim().startsWith("YT");
}

function classifyClient(
  trackingNo: string,
  data: ArriveResponseData | null
): Bucket {
  if (isYTTrackingClient(trackingNo)) return "yt";
  if (data && data.matched === true) return "forecasted";
  return "unclaimed";
}

const BUCKET_META: Record<
  Bucket,
  {
    label: string;
    tone: "ok" | "danger";
    banner: string;
    next: string;
    nextHref: (ctx: { trackingNo: string; inboundId?: string }) => string;
  }
> = {
  forecasted: {
    label: "集運有預報",
    tone: "ok",
    banner:
      "已對應預報，狀態已標記為「已到倉」。請將包裹送往收貨站秤重上架。",
    next: "前往收件上架",
    nextHref: () => "/zh-hk/wms/operations/receive",
  },
  yt: {
    label: "YT 件",
    tone: "ok",
    banner:
      "YT 小包件，已自動建立入庫記錄。請送往收貨站秤重上架，上架後會自動加入當日 YT 出庫單。",
    next: "前往收貨上架",
    nextHref: () => "/zh-hk/wms/operations/receive",
  },
  unclaimed: {
    label: "無頭件",
    tone: "danger",
    banner:
      "找不到對應預報，已自動建立無頭件記錄，等待 CS 指派客戶。可前往無頭件指派頁面查看。",
    next: "前往無頭件指派",
    nextHref: () => "/zh-hk/wms/operations/unclaimed-inbounds",
  },
};

const BUCKET_ICON: Record<Bucket, React.ReactNode> = {
  forecasted: <PackageCheck size={22} className="mt-0.5 flex-none" />,
  yt: <Truck size={22} className="mt-0.5 flex-none" />,
  unclaimed: <AlertTriangle size={22} className="mt-0.5 flex-none" />,
};

export default function Page() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const [lastEcho, setLastEcho] = React.useState<string | null>(null);
  const [current, setCurrent] = React.useState<ScanRow | null>(null);
  const [history, setHistory] = React.useState<ScanRow[]>([]);

  const submitScan = React.useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("tracking_no", trimmed);
      const r = await fetch("/api/wms/scan/arrive", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const d = await r.json();
      if (d.status !== 200) {
        const row: ScanRow = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ts: Date.now(),
          trackingNo: trimmed,
          bucket: "unclaimed",
          error: d.message || "Failed",
        };
        setCurrent(row);
        setHistory((h) => [row, ...h]);
        setError(d.message || "Failed");
        return;
      }
      const data: ArriveResponseData = d.data ?? {};
      const bucket = classifyClient(trimmed, data);

      // W5: auto-register on arrive — create inbound record immediately.
      let autoId: string | undefined;
      if (bucket === "yt") {
        // YT: auto-create inbound under SYS-YT client
        try {
          const ur = await fetch("/api/wms/scan/arrive/yt-quick", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tracking_no: trimmed }),
          });
          const ud = await ur.json();
          if (ud.status === 200 && ud.data?.inbound_id) {
            autoId = ud.data.inbound_id;
          }
          // INBOUND_DUPLICATED is fine — means it was already scanned.
        } catch {
          // Best-effort; the banner still shows guidance.
        }
      } else if (bucket === "unclaimed") {
        // Unclaimed: auto-create unclaimed_inbounds record
        try {
          const ur = await fetch("/api/wms/scan/arrive/unclaimed-quick", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tracking_no: trimmed }),
          });
          const ud = await ur.json();
          if (ud.status === 200 && ud.data?.unclaimed_id) {
            autoId = ud.data.unclaimed_id;
          }
        } catch {
          // Best-effort; the banner still shows guidance.
        }
      }

      const row: ScanRow = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(),
        trackingNo: trimmed,
        bucket,
        inboundId: data.inbound_id ? String(data.inbound_id) : autoId,
        scanId: data.scan_id ?? autoId,
      };
      setCurrent(row);
      setLastEcho(trimmed);
      setHistory((h) => [row, ...h]);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  // Direction A header tally — derived from the in-memory scan list
  // (purely visual; error rows excluded from bucket counts).
  const okRows = history.filter((r) => !r.error);
  const tally = {
    total: okRows.length,
    forecasted: okRows.filter((r) => r.bucket === "forecasted").length,
    yt: okRows.filter((r) => r.bucket === "yt").length,
    unclaimed: okRows.filter((r) => r.bucket === "unclaimed").length,
  };

  return (
    <WmsShell crumbs={[{ label: "起始流程" }, { label: "到倉掃描" }]}>
      <div className="px-[22px] py-3.5">
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-wms-border bg-wms-surface-alt px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-wms-faint">
            起始流程
          </span>
          <Stepper
            steps={[
              { label: "OMS 預報核對", state: "done" },
              { label: "到倉掃碼", state: "current" },
              { label: "上架管理", state: "todo" },
              { label: "進入出貨流程", state: "todo" },
            ]}
          />
        </div>

        <div className="mb-4 flex items-end gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-wms-disp text-[24px] font-extrabold tracking-[0.01em]">
                到倉掃描
              </h1>
              <Pill kind="brand">PC + USB 掃描器</Pill>
              <Pill kind="muted">PDA 仍可同步使用</Pill>
            </div>
            <div className="mt-0.5 text-[12.5px] text-wms-muted">
              純分流 · 不拍照 · 不秤重 — 掃描後即放上到倉車
            </div>
          </div>
          <span className="flex-1" />
          <div className="flex items-baseline gap-3.5 text-[13px] font-semibold text-wms-ink-2">
            <span>
              今日{" "}
              <span className="font-wms-mono text-[24px] font-bold">
                {tally.total}
              </span>{" "}
              件
            </span>
            <span className="text-wms-info-fg">預報 {tally.forecasted}</span>
            <span className="text-wms-ok-fg">YT {tally.yt}</span>
            <span className="text-wms-danger">無頭 {tally.unclaimed}</span>
          </div>
        </div>

        <div className="mb-3.5">
          <Scanner
            placeholder="掃描或輸入運單號（按 Enter 提交）"
            echo={lastEcho}
            disabled={busy}
            onScan={submitScan}
          />
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-3.5 rounded-[4px] bg-wms-danger px-[18px] py-3.5 text-white">
            <AlertTriangle size={22} className="mt-0.5 flex-none" />
            <div className="min-w-0 flex-1">
              <div className="font-wms-disp text-[17px] font-extrabold tracking-[0.01em]">
                掃描失敗
              </div>
              <div className="mt-0.5 text-[12.5px] opacity-85">{error}</div>
            </div>
          </div>
        )}

        {current && !current.error && <ResultBanner row={current} />}

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-wms-disp text-[15px] font-bold">
              最近 {MAX_HISTORY} 筆掃描
            </h2>
            <span className="text-[12px] text-wms-faint">
              （僅保留於本頁，重新整理後清空）
            </span>
          </div>
          {history.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-wms-border bg-wms-surface-alt px-4 py-6 text-center text-[13px] text-wms-faint">
              尚無掃描記錄
            </div>
          ) : (
            <div className="overflow-hidden rounded-[4px] border border-wms-border bg-wms-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead className="bg-wms-surface-alt">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-bold tracking-[0.1em] text-wms-faint">
                      時間
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold tracking-[0.1em] text-wms-faint">
                      運單號
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold tracking-[0.1em] text-wms-faint">
                      分類
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold tracking-[0.1em] text-wms-faint">
                      Inbound ID
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold tracking-[0.1em] text-wms-faint">
                      狀態
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, MAX_HISTORY).map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-wms-border hover:bg-wms-row-hover"
                    >
                      <td className="px-3 py-2 font-wms-mono text-[12px] text-wms-muted">
                        {new Date(row.ts).toLocaleTimeString("zh-HK", {
                          hour12: false,
                        })}
                      </td>
                      <td className="px-3 py-2 font-wms-mono">
                        {row.trackingNo}
                      </td>
                      <td className="px-3 py-2">
                        {row.bucket === "yt" ? (
                          <ModeBadge mode="yt" />
                        ) : row.bucket === "unclaimed" ? (
                          <Pill kind="danger">無頭</Pill>
                        ) : (
                          <Pill kind="ok">{BUCKET_META.forecasted.label}</Pill>
                        )}
                      </td>
                      <td className="px-3 py-2 font-wms-mono text-[12px]">
                        {row.inboundId ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {row.error ? (
                          <span className="font-semibold text-wms-danger">
                            {row.error}
                          </span>
                        ) : (
                          <span className="font-wms-mono text-wms-muted">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </WmsShell>
  );
}

function ResultBanner({ row }: { row: ScanRow }) {
  const meta = BUCKET_META[row.bucket];
  const href = meta.nextHref({
    trackingNo: row.trackingNo,
    inboundId: row.inboundId,
  });
  return (
    <div
      className={cn(
        "flex items-start gap-3.5 rounded-[4px] px-[18px] py-3.5 text-white",
        meta.tone === "ok" ? "bg-wms-ok-strong" : "bg-wms-danger"
      )}
    >
      {BUCKET_ICON[row.bucket]}
      <div className="min-w-0 flex-1">
        <div className="font-wms-disp text-[17px] font-extrabold tracking-[0.01em]">
          {meta.label} ·{" "}
          <span className="font-wms-mono">{row.trackingNo}</span>
        </div>
        <div className="mt-0.5 text-[12.5px] opacity-85">
          {meta.banner}
          {row.inboundId && (
            <>
              {" "}
              · <span className="font-wms-mono">{row.inboundId}</span>
            </>
          )}
        </div>
        <a
          href={href}
          className="mt-1.5 inline-block text-[12.5px] font-bold text-white underline"
        >
          {meta.next} →
        </a>
      </div>
    </div>
  );
}

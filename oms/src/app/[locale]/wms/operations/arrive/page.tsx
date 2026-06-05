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

"use client";

import * as React from "react";

import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { Stepper } from "@/components/wms-redesign/stepper";
import { WmsShell } from "@/components/wms-redesign/wms-shell";

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
    emoji: string;
    pill: "ok" | "info" | "warn";
    banner: string;
    next: string;
    nextHref: (ctx: { trackingNo: string; inboundId?: string }) => string;
  }
> = {
  forecasted: {
    label: "集運有預報",
    emoji: "📦",
    pill: "ok",
    banner:
      "預報命中。狀態已標記為「已到倉」，請帶包裹去收件上架站做拍照、秤重同上架。",
    next: "前往收件上架",
    nextHref: () => "/zh-hk/wms/operations/receive",
  },
  yt: {
    label: "YT 件",
    emoji: "🚛",
    pill: "info",
    banner:
      "YT 小包件，已自動建立入庫記錄。請帶去收貨站做秤重、量尺寸同上架，上架後會自動加入今日 YT 出庫單。",
    next: "前往收貨上架",
    nextHref: () => "/zh-hk/wms/operations/receive",
  },
  unclaimed: {
    label: "無頭件",
    emoji: "❓",
    pill: "warn",
    banner:
      "搵唔到對應預報。已自動建立無頭件記錄，等待 CS 指派客戶。可去無頭件指派頁面睇返。",
    next: "前往無頭件指派",
    nextHref: () => "/zh-hk/wms/operations/unclaimed-inbounds",
  },
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
        setHistory((h) => [row, ...h].slice(0, MAX_HISTORY));
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
      setHistory((h) => [row, ...h].slice(0, MAX_HISTORY));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

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

        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">到倉掃描</h1>
          <Pill kind="brand">PC + USB 掃描器</Pill>
          <Pill kind="muted">PDA 仍可同步使用</Pill>
        </div>

        <div className="mb-3.5">
          <Scanner
            placeholder="掃 / 鍵入運單號（按 Enter 提交）"
            echo={lastEcho}
            disabled={busy}
            onScan={submitScan}
          />
        </div>

        {error && (
          <div className="mb-3 rounded-[10px] border border-wms-danger-bg bg-wms-danger-bg px-4 py-3 text-[13px] text-wms-danger-fg">
            <strong>失敗</strong> · {error}
          </div>
        )}

        {current && !current.error && <ResultBanner row={current} />}

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">最近 5 筆掃描</h2>
            <span className="text-[12px] text-wms-faint">
              （只保留於本頁，重整即清空）
            </span>
          </div>
          {history.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-wms-border bg-wms-surface-alt px-4 py-6 text-center text-[13px] text-wms-faint">
              未有掃描記錄
            </div>
          ) : (
            <div className="overflow-hidden rounded-[10px] border border-wms-border bg-wms-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead className="bg-wms-surface-alt text-[11.5px] uppercase tracking-wider text-wms-faint">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">時間</th>
                    <th className="px-3 py-2 text-left font-semibold">運單號</th>
                    <th className="px-3 py-2 text-left font-semibold">分類</th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Inbound ID
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
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
                        <Pill kind={BUCKET_META[row.bucket].pill}>
                          {BUCKET_META[row.bucket].emoji}{" "}
                          {BUCKET_META[row.bucket].label}
                        </Pill>
                      </td>
                      <td className="px-3 py-2 font-wms-mono text-[12px]">
                        {row.inboundId ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {row.error ? (
                          <span className="text-wms-danger-fg">
                            {row.error}
                          </span>
                        ) : (
                          <span className="text-wms-muted">OK</span>
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
  const bgByKind: Record<typeof meta.pill, string> = {
    ok: "bg-wms-ok-bg text-wms-ok-fg",
    info: "bg-wms-info-bg text-wms-info-fg",
    warn: "bg-wms-warn-bg text-wms-warn-fg",
  };
  const href = meta.nextHref({
    trackingNo: row.trackingNo,
    inboundId: row.inboundId,
  });
  return (
    <div
      className={`flex items-start gap-3 rounded-[10px] px-4 py-3 text-[13px] ${bgByKind[meta.pill]}`}
    >
      <span className="text-[20px] leading-[1]">{meta.emoji}</span>
      <div className="flex-1">
        <div className="mb-1 flex items-center gap-2">
          <strong className="text-[14px]">{meta.label}</strong>
          <span className="font-wms-mono text-[12px] opacity-80">
            {row.trackingNo}
          </span>
          {row.inboundId && (
            <span className="font-wms-mono text-[12px] opacity-80">
              · {row.inboundId}
            </span>
          )}
        </div>
        <div className="opacity-90">{meta.banner}</div>
        <a
          href={href}
          className="mt-1.5 inline-block text-[12.5px] font-semibold underline"
        >
          {meta.next} →
        </a>
      </div>
    </div>
  );
}

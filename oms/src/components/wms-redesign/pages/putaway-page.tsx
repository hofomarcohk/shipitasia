// P17 — handoff #putaway page.
//
// Scanner-driven: user scans inbound tracking → page calls
// receive-lookup → renders the hero with auto-filled item context,
// shelf picker (free input + recent suggestions) + weight + dimension
// form → confirm posts to /api/wms/scan/receive.
//
// W2 — YT 件 PC putaway 解禁 + photo upload (file input, not webcam).
// PDA still handles its own camera-capture flow; PC station uses plain
// file inputs so a barcode / package photo can come from a desktop
// scanner or pre-taken phone image. Form fields mirror pda-receive:
// `photo_barcode` + `photo_package` multipart parts.
//
// W6 — Direction A visual conformance: session card (2px ink border),
// 「當前收貨」 header row, filled mono inputs, ink shelf chips,
// ok-strong confirm + keycap, warn-soft pending header. Logic untouched.

"use client";

import {
  AlertTriangle,
  Camera,
  Check,
  Filter,
  X,
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

interface ReceiveLookupItem {
  _id: string;
  client_id: string;
  status: string;
  shipping_mode: string;
  tracking_no: string;
  actualWeight: number | null;
  actualDimension: { length: number; width: number; height: number } | null;
  is_yt?: boolean;
}

const STEPPER = [
  { label: "OMS 預報核對", state: "done" as const },
  { label: "到倉掃碼", state: "done" as const },
  { label: "上架管理", state: "current" as const },
  { label: "進入出貨流程", state: "todo" as const },
];

const RECENT_SHELVES = ["A001", "A002", "A003"];

const FIELD_LABEL =
  "text-[11.5px] font-bold tracking-[0.08em] text-wms-faint";

function PhotoSlot({
  label,
  file,
  preview,
  onChange,
}: {
  label: string;
  file: File | null;
  preview: string | null;
  onChange: (f: File | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  return (
    <div className="w-[110px] flex-none">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[4px] border-[1.5px] text-wms-faint transition",
          preview
            ? "border-wms-border bg-wms-surface"
            : "border-dashed border-wms-border-strong bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.03)_6px,rgba(0,0,0,0.03)_12px)] hover:border-wms-ink"
        )}
        aria-label={`上傳${label}`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <Camera size={26} />
        )}
        {preview && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onChange(null);
              }
            }}
            className="absolute right-1 top-1 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-wms-ink/85 text-white hover:bg-wms-ink"
            aria-label={`移除${label}`}
          >
            <X size={12} strokeWidth={2.5} />
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <div className="mt-1.5 truncate text-center text-[11px] text-wms-muted">
        {file ? file.name : label}
      </div>
    </div>
  );
}

export function PutawayPageClient() {
  const [scanned, setScanned] = React.useState<string | null>(null);
  const [item, setItem] = React.useState<ReceiveLookupItem | null>(null);
  const [shelf, setShelf] = React.useState("");
  const [weight, setWeight] = React.useState<string>("");
  const [length, setLength] = React.useState<string>("");
  const [width, setWidth] = React.useState<string>("");
  const [height, setHeight] = React.useState<string>("");
  const [barcodeFile, setBarcodeFile] = React.useState<File | null>(null);
  const [packageFile, setPackageFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(0);

  // W5: 待收貨清單 — 已到倉但尚未收貨上架的件
  interface PendingItem { _id: string; tracking_no: string; client_id: string; arrivedAt: string; shipping_mode: string; }
  const [pendingItems, setPendingItems] = React.useState<PendingItem[]>([]);
  const loadPending = React.useCallback(async () => {
    try {
      const res = await get_request("/api/wms/inbound/list?status=arrived&limit=50");
      const json = await res.json();
      if (json?.status === 200) setPendingItems(json.data?.items ?? json.data ?? []);
    } catch { /* non-blocking */ }
  }, []);
  React.useEffect(() => { loadPending(); }, [loadPending]);

  // Preview URLs from File objects — must be revoked on unmount / change
  // to avoid blob leaks across many sequential scans.
  const barcodePreview = React.useMemo(
    () => (barcodeFile ? URL.createObjectURL(barcodeFile) : null),
    [barcodeFile]
  );
  const packagePreview = React.useMemo(
    () => (packageFile ? URL.createObjectURL(packageFile) : null),
    [packageFile]
  );
  React.useEffect(() => {
    return () => {
      if (barcodePreview) URL.revokeObjectURL(barcodePreview);
    };
  }, [barcodePreview]);
  React.useEffect(() => {
    return () => {
      if (packagePreview) URL.revokeObjectURL(packagePreview);
    };
  }, [packagePreview]);

  React.useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  // 完全重置（手動「清空」按鈕用）
  const reset = () => {
    setScanned(null);
    setItem(null);
    setShelf("");
    setWeight("");
    setLength("");
    setWidth("");
    setHeight("");
    setBarcodeFile(null);
    setPackageFile(null);
    setError(null);
  };

  // 連掃用：成功確認後保留貨架/重量/材積，
  // 只清「件相關」資料 (件、tracking、照片、錯誤)，
  // 讓相似包裹倉庫員只需改少數欄位。
  const softReset = () => {
    setScanned(null);
    setItem(null);
    setBarcodeFile(null);
    setPackageFile(null);
    setError(null);
  };

  const handleScan = async (v: string) => {
    setError(null);
    setScanned(v);
    // W2: YT 件不再 throw — PC station now supports the same multipart
    // shelve as the PDA (file-input photo upload). The auto-append into
    // today's YT outbound continues to happen server-side in yt-service.
    try {
      const res = await post_request(
        "/api/wms/scan/receive/lookup",
        { identifier: v }
      );
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Lookup failed");
      }
      if (!json?.data?.matched) {
        throw new Error("非預報入庫 — 請改用無頭件流程處理");
      }
      const ib: ReceiveLookupItem = json.data.inbound;
      // 阻擋已上架 / 不可 receive 的 status，避免重複上架
      if (ib.status === "received") {
        throw new Error("此件已上架（狀態 received），請勿重複上架");
      }
      if (ib.status === "cancelled") {
        throw new Error("此件已取消（cancelled）");
      }
      if (ib.status === "abandoned") {
        throw new Error("此件已棄置（abandoned）");
      }
      if (ib.status !== "pending" && ib.status !== "arrived") {
        throw new Error(`此件狀態 ${ib.status} 不可上架（僅接受 pending / arrived）`);
      }
      setItem(ib);
      if (ib.actualWeight) setWeight(String(ib.actualWeight));
      if (ib.actualDimension) {
        setLength(String(ib.actualDimension.length));
        setWidth(String(ib.actualDimension.width));
        setHeight(String(ib.actualDimension.height));
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const confirm = async () => {
    if (!item) return;
    if (!shelf.trim()) {
      setError("請先選擇貨架");
      return;
    }
    // W5: 重量必填；尺寸 YT 件可免，集運/直送必填
    const w = Number(weight);
    if (!weight || isNaN(w) || w <= 0) {
      setError("請輸入重量（kg）");
      return;
    }
    const isYt = item.is_yt === true;
    if (!isYt) {
      const l = Number(length), wd = Number(width), h = Number(height);
      if (!length || !width || !height || isNaN(l) || isNaN(wd) || isNaN(h) || l <= 0 || wd <= 0 || h <= 0) {
        setError("請輸入完整尺寸（長 × 闊 × 高，cm）");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      // W5: YT items route to yt-shelve (no wallet charge, auto-append to
      // today's YT outbound). Regular items use the standard receive endpoint.
      const isYt = item.is_yt === true;
      const endpoint = isYt ? "/api/wms/scan/yt-shelve" : "/api/wms/scan/receive";
      const fd = new FormData();
      fd.set("inbound_id", item._id);
      if (isYt) fd.set("tracking_no", item.tracking_no);
      fd.set("locationCode", shelf.trim());
      if (weight) fd.set("weight", weight);
      // YT 件尺寸非必填，但 backend schema 要求有值 → 給默認 1×1×1
      const dim = length && width && height
        ? { length: Number(length), width: Number(width), height: Number(height) }
        : isYt ? { length: 1, width: 1, height: 1 } : null;
      if (dim) fd.set("dimension", JSON.stringify(dim));
      if (barcodeFile) fd.set("photo_barcode", barcodeFile);
      if (packageFile) fd.set("photo_package", packageFile);
      const res = await fetch(endpoint, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Receive failed");
      }
      setConfirmed((c) => c + 1);
      setToast(`${item.tracking_no} 上架到 ${shelf} ✓`);
      softReset();
      loadPending(); // refresh 待收貨清單
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const ctaState: "locked" | "ready" =
    confirmed > 0 && !item ? "ready" : "locked";

  const dimInputCls = (v: string) =>
    cn(
      "h-[38px] w-[56px] rounded-[4px] border-[1.5px] px-1 text-center font-wms-mono text-[15px] font-bold outline-none focus:border-wms-ink",
      v
        ? "border-wms-ink bg-wms-surface-alt"
        : "border-wms-border-strong bg-wms-surface"
    );

  return (
    <WmsShell
      crumbs={[{ label: "起始流程" }, { label: "上架管理" }]}
      cta={
        <NextCTA
          state={ctaState}
          to="putaway"
          progress={{ done: confirmed, total: confirmed + (item ? 1 : 0) }}
          lockedHint={
            item
              ? "確認當前件上架後繼續"
              : confirmed === 0
                ? "掃描下一件開始"
                : undefined
          }
          back={{
            url: "/zh-hk/wms",
            label: "工作台",
          }}
        />
      }
    >
      <div className="px-[22px] py-3.5">
        <div className="mb-3.5 flex items-center gap-3 rounded-xl border border-wms-border bg-wms-surface-alt px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-wms-faint">
            起始流程
          </span>
          <Stepper steps={STEPPER} />
          <span className="flex-1" />
          <span className="text-xs text-wms-muted">
            上架後：集運等待客戶開單 · 單發自動開單 · YT 自動加入當日 YT 出庫單
          </span>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-wms-disp text-[24px] font-extrabold tracking-[0.01em]">
                上架管理
              </h1>
              <Pill kind="muted">本次作業已上架 {confirmed}</Pill>
            </div>
            <div className="mt-0.5 text-[12.5px] text-wms-muted">
              掃描包裹 → 拍照（可選）→ 重量（必填）→ 尺寸（YT 免）→ 選擇貨架 →
              確認上架，連續掃描作業
            </div>
          </div>
          <span className="flex-1" />
          <button className="inline-flex items-center gap-1.5 rounded-md border border-wms-border bg-wms-surface px-2.5 py-1 text-xs hover:bg-wms-row-hover">
            <Filter size={13} /> 篩選
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-wms-danger/30 bg-wms-danger-bg px-3 py-2 text-sm font-semibold text-wms-danger-fg">
            <AlertTriangle size={14} className="-mt-px mr-1 inline" />
            {error}
          </div>
        )}

        <div className="mb-3.5">
          <Scanner
            placeholder="拿起手邊包裹 → 掃描入庫條碼 → 自動帶出下方資料"
            echo={item ? item.tracking_no : undefined}
            onScan={handleScan}
            autoFocus={!item}
          />
        </div>

        <div
          className={cn(
            "rounded-[3px] border-2 bg-wms-surface p-5",
            scanned
              ? "border-wms-ink"
              : "border-wms-border bg-wms-surface-alt"
          )}
        >
          <div className="mb-4 flex items-center gap-3 border-b border-wms-border pb-3">
            <span className="font-wms-disp text-[12px] font-bold uppercase tracking-[0.12em] text-wms-ink-2">
              當前收貨
            </span>
            {item ? (
              <>
                <ModeBadge
                  mode={
                    item.is_yt
                      ? "yt"
                      : item.shipping_mode === "single_direct"
                        ? "single"
                        : "consolidated"
                  }
                />
                <span className="font-wms-mono text-[15px] font-bold tracking-tight">
                  {item.tracking_no}
                </span>
                <span className="text-[12.5px] text-wms-muted">
                  件主 {item.client_id.slice(-6).toUpperCase()}
                </span>
                <span className="font-wms-mono text-[11.5px] text-wms-muted">
                  狀態 {item.status}
                </span>
                <span className="flex-1" />
                <Pill kind="warn">收貨中</Pill>
              </>
            ) : (
              <span className="text-[12.5px] text-wms-faint">
                等候掃描下一件…
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-[18px]">
            <div className="flex flex-col gap-1.5">
              <span className={FIELD_LABEL}>
                相片{" "}
                <em className="not-italic font-medium opacity-80">可選</em>
              </span>
              <div className="flex items-start gap-3">
                <PhotoSlot
                  label="條碼照片"
                  file={barcodeFile}
                  preview={barcodePreview}
                  onChange={setBarcodeFile}
                />
                <PhotoSlot
                  label="包裹照片"
                  file={packageFile}
                  preview={packagePreview}
                  onChange={setPackageFile}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={FIELD_LABEL}>
                重量 kg{" "}
                <em className="not-italic font-medium text-wms-danger">
                  必填
                </em>
              </span>
              <input
                type="number"
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="0.00"
                className={cn(
                  "h-[44px] w-[120px] rounded-[4px] border-[1.5px] px-3 text-center font-wms-mono text-[19px] font-bold outline-none focus:border-wms-ink",
                  weight
                    ? "border-wms-ink bg-wms-surface-alt"
                    : "border-wms-border-strong bg-wms-surface"
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={FIELD_LABEL}>
                尺寸 cm{" "}
                <em className="not-italic font-medium text-wms-danger">
                  必填 · YT 免
                </em>
              </span>
              <div className="flex items-center gap-1.5 text-wms-faint">
                <input
                  type="number"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className={dimInputCls(length)}
                  placeholder="L"
                />
                ×
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  className={dimInputCls(width)}
                  placeholder="W"
                />
                ×
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className={dimInputCls(height)}
                  placeholder="H"
                />
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className={cn("mb-2", FIELD_LABEL)}>分配貨架</div>
            <div className="flex gap-2">
              {RECENT_SHELVES.map((code) => (
                <button
                  key={code}
                  onClick={() => setShelf(code)}
                  className={cn(
                    "inline-flex items-center rounded-[4px] border-[1.5px] px-3 py-2 text-left font-bold transition",
                    shelf === code
                      ? "border-wms-ink bg-wms-ink text-white"
                      : "border-wms-border-strong bg-wms-surface text-wms-ink-2 hover:bg-wms-row-hover"
                  )}
                >
                  <span className="font-wms-mono text-lg tracking-tight">
                    {code}
                  </span>
                </button>
              ))}
              <input
                value={shelf && !RECENT_SHELVES.includes(shelf) ? shelf : ""}
                onChange={(e) => setShelf(e.target.value)}
                placeholder="或輸入貨架碼"
                className="flex-1 rounded-[4px] border-[1.5px] border-dashed border-wms-border-strong bg-transparent px-3 py-2 font-wms-mono text-sm text-wms-muted outline-none focus:border-wms-ink focus:text-wms-ink"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 text-xs text-wms-muted">
              ✓ 件主 · ✓ 重量 · ✓ 材積 — 確認後繼續下一件
            </div>
            <button
              onClick={reset}
              className="rounded-md border border-wms-border bg-wms-surface px-3 py-2 text-sm hover:bg-wms-row-hover"
            >
              跳過此件
            </button>
            <button
              onClick={confirm}
              disabled={busy || !item || !shelf.trim()}
              className="inline-flex items-center gap-2 rounded-[4px] bg-wms-ok-strong px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
            >
              <Check size={15} strokeWidth={2.5} />
              確認上架到 {shelf || "—"}
              <span className="rounded bg-white/20 px-1.5 font-wms-mono text-[11px]">
                ↵
              </span>
            </button>
          </div>
        </div>

        {/* W5: 待收貨清單 — 已到倉但尚未上架 */}
        {pendingItems.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-[4px] border border-wms-border bg-wms-surface">
            <div className="flex items-center gap-2 border-b border-wms-border bg-wms-warn-bg px-3.5 py-2.5">
              <AlertTriangle size={14} className="text-wms-warn-fg" />
              <h3 className="font-wms-disp text-[13px] font-bold text-wms-warn-fg">
                待收貨 — 已到倉未上架
              </h3>
              <Pill kind="warn">{pendingItems.length} 件</Pill>
              <span className="flex-1" />
              <span className="text-[11px] text-wms-warn-fg/80">
                對應側欄待辦數字
              </span>
            </div>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-wms-border bg-wms-surface-alt">
                  <th className="px-3 py-2 text-left text-[11px] font-bold tracking-[0.1em] text-wms-faint">Tracking No</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold tracking-[0.1em] text-wms-faint">Inbound ID</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold tracking-[0.1em] text-wms-faint">類型</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold tracking-[0.1em] text-wms-faint">到倉時間</th>
                </tr>
              </thead>
              <tbody>
                {pendingItems.map((p) => (
                  <tr key={p._id} className="border-b border-wms-border last:border-b-0 hover:bg-wms-row-hover">
                    <td className="px-3 py-2 font-wms-mono font-semibold">{p.tracking_no}</td>
                    <td className="px-3 py-2 font-wms-mono text-wms-muted">{p._id}</td>
                    <td className="px-3 py-2">
                      <ModeBadge mode={p.shipping_mode === "single_direct" ? "single" : "consolidated"} />
                    </td>
                    <td className="px-3 py-2 font-wms-mono text-wms-muted">
                      {p.arrivedAt ? new Date(p.arrivedAt).toLocaleString("zh-HK", { hour12: false }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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

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
import { get_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";

interface ReceiveLookupItem {
  _id: string;
  client_id: string;
  status: string;
  shipping_mode: string;
  tracking_no: string;
  actualWeight: number | null;
  actualDimension: { length: number; width: number; height: number } | null;
}

const STEPPER = [
  { label: "OMS 預報核對", state: "done" as const },
  { label: "PDA 到倉掃碼", state: "done" as const },
  { label: "上架管理", state: "current" as const },
  { label: "進入出貨流程", state: "todo" as const },
];

const RECENT_SHELVES = ["A-04", "A-05", "B-02", "C-07", "YT-1", "YT-2"];

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
          "group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[10px] border text-wms-faint transition",
          preview
            ? "border-wms-border bg-wms-surface"
            : "border-wms-border bg-[repeating-linear-gradient(135deg,#F1F5F9_0_6px,#E2E8F0_6px_12px)] hover:border-wms-ink"
        )}
        aria-label={`上載${label}`}
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

  const handleScan = async (v: string) => {
    setError(null);
    setScanned(v);
    // W2: YT 件不再 throw — PC station now supports the same multipart
    // shelve as the PDA (file-input photo upload). The auto-append into
    // today's YT outbound continues to happen server-side in yt-service.
    try {
      const res = await get_request(
        `/api/wms/scan/receive/lookup?id=${encodeURIComponent(v)}`
      );
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Lookup failed");
      }
      if (!json?.data?.matched) {
        throw new Error("唔係預報入庫 — 用 unclaimed-pool 處理");
      }
      const ib: ReceiveLookupItem = json.data.inbound;
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
      setError("揀貨架先");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("inbound_id", item._id);
      fd.set("locationCode", shelf.trim());
      if (weight) fd.set("weight", weight);
      if (length && width && height) {
        fd.set(
          "dimension",
          JSON.stringify({
            length: Number(length),
            width: Number(width),
            height: Number(height),
          })
        );
      }
      // Photos optional from PC station — backend treats them as
      // additive (direct-receive mode enforces them server-side when
      // required). Field names mirror pda-receive exactly.
      if (barcodeFile) fd.set("photo_barcode", barcodeFile);
      if (packageFile) fd.set("photo_package", packageFile);
      const res = await fetch("/api/wms/scan/receive", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Receive failed");
      }
      setConfirmed((c) => c + 1);
      setToast(`${item.tracking_no} 上架到 ${shelf} ✓`);
      reset();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const ctaState: "locked" | "ready" =
    confirmed > 0 && !item ? "ready" : "locked";

  return (
    <WmsShell
      crumbs={[{ label: "起始流程" }, { label: "上架管理" }]}
      cta={
        <NextCTA
          state={ctaState}
          to="pick"
          progress={{ done: confirmed, total: confirmed + (item ? 1 : 0) }}
          lockedHint={
            item
              ? "確認當前件上架後繼續"
              : confirmed === 0
                ? "掃下一件貨開始"
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
            上架後 · 集運 → 出庫單生成 · YT → 自動加入今日 YT 單
          </span>
        </div>

        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">上架管理</h1>
          <Pill kind="muted">本 session 已上架 {confirmed}</Pill>
          <span className="flex-1" />
          <button className="inline-flex items-center gap-1.5 rounded-md border border-wms-border bg-wms-surface px-2.5 py-1 text-xs hover:bg-wms-row-hover">
            <Filter size={13} /> 篩選
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-3 py-2 text-sm text-wms-danger-fg">
            <AlertTriangle size={14} className="-mt-px mr-1 inline" />
            {error}
          </div>
        )}

        <div
          className={cn(
            "rounded-xl border-[1.5px] bg-wms-surface p-5",
            scanned ? "border-wms-ink" : "border-wms-border bg-wms-surface-alt"
          )}
        >
          <Scanner
            placeholder="攞起手邊嘅件 → 掃 inbound barcode → 自動填好下方資訊"
            echo={item ? `已掃 ${item.tracking_no}` : undefined}
            onScan={handleScan}
            autoFocus={!item}
          />

          {!scanned && (
            <div className="px-3 pb-1 pt-8 text-center text-sm text-wms-muted">
              ⬆ 用掃描槍掃件貨，系統會自動 surface 件主、SKU、預設貨架
            </div>
          )}

          {item && (
            <>
              <div className="mt-4 flex items-start gap-4">
                <PhotoSlot
                  label="條碼相"
                  file={barcodeFile}
                  preview={barcodePreview}
                  onChange={setBarcodeFile}
                />
                <PhotoSlot
                  label="包裹相"
                  file={packageFile}
                  preview={packagePreview}
                  onChange={setPackageFile}
                />

                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <h2 className="text-lg font-semibold">
                      {item.client_id.slice(-6).toUpperCase()}
                    </h2>
                    <ModeBadge
                      mode={
                        item.shipping_mode === "single_direct"
                          ? "single"
                          : "consolidated"
                      }
                    />
                    <span className="flex-1" />
                    <span className="font-wms-mono text-[11.5px] text-wms-muted">
                      狀態 {item.status}
                    </span>
                  </div>
                  <div className="mb-3 text-[13px] text-wms-muted">
                    {item.tracking_no}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="rounded-[10px] border border-wms-border bg-wms-surface-alt p-2.5">
                      <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-wms-faint">
                        重量 (kg)
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        placeholder="例: 4.20"
                        className="w-full border-0 bg-transparent font-wms-mono text-lg font-semibold outline-none"
                      />
                    </label>
                    <label className="rounded-[10px] border border-wms-border bg-wms-surface-alt p-2.5">
                      <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-wms-faint">
                        材積 (L × W × H, cm)
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={length}
                          onChange={(e) => setLength(e.target.value)}
                          className="w-12 border-0 bg-transparent font-wms-mono text-sm font-semibold outline-none"
                          placeholder="L"
                        />
                        ×
                        <input
                          type="number"
                          value={width}
                          onChange={(e) => setWidth(e.target.value)}
                          className="w-12 border-0 bg-transparent font-wms-mono text-sm font-semibold outline-none"
                          placeholder="W"
                        />
                        ×
                        <input
                          type="number"
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                          className="w-12 border-0 bg-transparent font-wms-mono text-sm font-semibold outline-none"
                          placeholder="H"
                        />
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 text-[12.5px] font-semibold uppercase tracking-wider text-wms-muted">
                  分配貨架
                </div>
                <div className="flex gap-2">
                  {RECENT_SHELVES.map((code) => (
                    <button
                      key={code}
                      onClick={() => setShelf(code)}
                      className={cn(
                        "flex flex-1 flex-col gap-1 rounded-[10px] border-2 p-2.5 text-left text-sm font-semibold transition",
                        shelf === code
                          ? "border-wms-brand bg-wms-brand-soft text-wms-brand"
                          : "border-wms-border bg-wms-surface text-wms-ink-2 hover:bg-wms-row-hover"
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
                    className="flex-1 rounded-[10px] border-2 border-dashed border-wms-border-strong bg-transparent px-3 py-2 font-wms-mono text-sm text-wms-muted outline-none focus:border-wms-ink focus:text-wms-ink"
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
                  跳過呢件
                </button>
                <button
                  onClick={confirm}
                  disabled={busy || !shelf.trim()}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-wms-ink px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  <Check size={15} strokeWidth={2.5} />
                  確認上架到 {shelf || "—"} · ↵
                </button>
              </div>
            </>
          )}
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

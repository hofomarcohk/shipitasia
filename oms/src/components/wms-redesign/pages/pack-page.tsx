// P17 — handoff #pack (mode-first) page.
//
// Three columns:
//   - left: 在桌面 (open desk items waiting to be packed)
//   - mid:  scanner bar + mode-specific in-hand hero
//   - right: 進行中嘅箱 (open boxes; eligible group on top, dim others)
//
// In-hand hero renders 1 of 3 layouts based on the scanned item's mode
// (consolidated / single / yt). Mode also drives left-bar colour on
// desk rows + box cards. Confirmation places the item in a box and
// refreshes state from /api/wms/outbound/pack/state.

"use client";

import {
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  Plus,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { ModeBadge, type Mode } from "@/components/wms-redesign/mode-badge";
import { NextCTA } from "@/components/wms-redesign/next-cta";
import { Pill } from "@/components/wms-redesign/pill";
import { Scanner } from "@/components/wms-redesign/scanner";
import { Stepper } from "@/components/wms-redesign/stepper";
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

interface StationDeskItem {
  inbound_id: string;
  outbound_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  tracking_no: string;
  product_name: string | null;
  shipment_type: "single" | "consolidated";
  declared_items_count: number;
  is_yt?: boolean;
}
interface StationOpenBox {
  _id: string;
  box_no: string;
  client_id: string;
  client_code: string;
  status: string;
  is_single_direct?: boolean;
  is_yt?: boolean;
  max_slots: number;
  items: { inbound_id: string; tracking_no: string }[];
  opened_at?: string;
}
interface StationState {
  desk: StationDeskItem[];
  open_boxes: StationOpenBox[];
  stats: { desk_count: number; open_box_count: number; packed_item_count: number };
}
interface ScanResult {
  mode: "place" | "swap";
  item: {
    inbound_id: string;
    outbound_id: string;
    tracking_no: string;
    product_name: string | null;
    shipment_type: "single" | "consolidated";
    is_yt: boolean;
  };
  owner: {
    client_id: string;
    client_code: string;
    client_name: string;
    desk_count: number;
    related_outbounds: { outbound_id: string; inbound_count: number }[];
    open_boxes: StationOpenBox[];
  };
  from_box?: StationOpenBox;
}

const SYSTEM_CLIENT_ID = "SYS-YT";

function modeForItem(it: { is_yt?: boolean; shipment_type?: string | null }): Mode {
  if (it.is_yt) return "yt";
  if (it.shipment_type === "single") return "single";
  return "consolidated";
}
function modeForBox(b: StationOpenBox): Mode {
  if (b.is_yt || b.client_id === SYSTEM_CLIENT_ID) return "yt";
  if (b.is_single_direct) return "single";
  return "consolidated";
}

const MODE_BG: Record<Mode, string> = {
  consolidated: "bg-wms-info-bg",
  single: "bg-wms-ok-bg",
  yt: "bg-wms-purple-bg",
};
const MODE_FG: Record<Mode, string> = {
  consolidated: "text-wms-info-fg",
  single: "text-wms-ok-fg",
  yt: "text-wms-purple-fg",
};
const MODE_BORDER: Record<Mode, string> = {
  consolidated: "border-wms-info-fg/30",
  single: "border-wms-ok-fg/30",
  yt: "border-wms-purple-fg/30",
};
const MODE_BAR_BG: Record<Mode, string> = {
  consolidated: "bg-wms-info-fg",
  single: "bg-wms-ok-fg",
  yt: "bg-wms-purple-fg",
};

const STEPPER = [
  { label: "揀貨", state: "done" as const },
  { label: "裝箱", state: "current" as const },
  { label: "秤重取單", state: "todo" as const },
  { label: "印單", state: "todo" as const },
  { label: "離站", state: "todo" as const },
];

// ── helper components ─────────────────────────────────────

function DeskRow({
  item,
  active,
  onClick,
}: {
  item: StationDeskItem;
  active: boolean;
  onClick: () => void;
}) {
  const mode = modeForItem(item);
  return (
    <div
      onClick={onClick}
      className={cn(
        "mb-1.5 flex cursor-pointer items-stretch overflow-hidden rounded-lg border bg-wms-surface",
        active ? "border-wms-ink bg-wms-surface-alt" : "border-wms-border hover:bg-wms-row-hover"
      )}
    >
      <div className={cn("w-[3px] flex-none", MODE_BAR_BG[mode])} />
      <div className="flex flex-1 items-center gap-2.5 p-2 px-2.5">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <ModeBadge mode={mode} />
            <span className="font-wms-mono text-[11.5px] font-medium text-wms-ink-2">
              {item.tracking_no}
            </span>
          </div>
          <div className="truncate text-[11.5px] text-wms-muted">
            {item.product_name ?? "—"} · {item.client_code}
          </div>
        </div>
        <button
          className={cn(
            "rounded-md border px-2 py-1 text-[11px] font-medium",
            active
              ? "border-wms-ink bg-wms-ink text-white"
              : "border-wms-border bg-wms-surface text-wms-ink-2 hover:bg-wms-row-hover"
          )}
        >
          {active ? "在手" : "Scan"}
        </button>
      </div>
    </div>
  );
}

function BoxCard({
  box,
  dimmed,
  recommended,
  onClickPlace,
}: {
  box: StationOpenBox;
  dimmed?: boolean;
  recommended?: boolean;
  onClickPlace?: () => void;
}) {
  const mode = modeForBox(box);
  const items = box.items?.length ?? 0;
  return (
    <div
      className={cn(
        "mb-2 flex items-stretch overflow-hidden rounded-[10px] border bg-wms-surface",
        recommended ? "border-2 border-wms-warn-fg bg-[#FFFEF7]" : "border-wms-border",
        dimmed && "opacity-50"
      )}
    >
      <div className={cn("w-[3px] flex-none", MODE_BAR_BG[mode])} />
      <div className="flex-1 p-2.5">
        <div className="mb-1 flex items-center gap-1.5">
          <ModeBadge mode={mode} />
          <span className="font-wms-mono text-[12.5px] font-semibold">{box.box_no}</span>
          <span className="flex-1" />
          <span className="font-wms-mono text-[11px] text-wms-muted">
            {items} 件
          </span>
          {recommended && <Pill kind="warn">推薦</Pill>}
        </div>
        <div className="mb-1.5 text-[11.5px] text-wms-muted">
          {box.client_code}
          {box.opened_at && ` · 開箱 ${new Date(box.opened_at).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit" })}`}
        </div>
        <div className="flex flex-wrap gap-1">
          {(box.items ?? []).slice(0, 6).map((p, i) => (
            <span
              key={i}
              className="rounded border border-wms-border bg-wms-surface-alt px-1.5 py-px font-wms-mono text-[10px] text-wms-muted"
            >
              {p.tracking_no?.slice(-6) ?? "?"}
            </span>
          ))}
          {items > 6 && (
            <span className="text-[10px] text-wms-faint">+{items - 6}</span>
          )}
        </div>
        {onClickPlace && !dimmed && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={onClickPlace}
              className="inline-flex items-center gap-1 rounded-md border border-wms-border bg-wms-surface px-2 py-1 text-[11px] hover:bg-wms-row-hover"
            >
              入呢箱 <ArrowRight size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MidHero({
  scan,
  recommended,
  compatibleBoxes,
  onConfirm,
  onOpenNew,
}: {
  scan: ScanResult;
  recommended: StationOpenBox | null;
  /** Owner open boxes already filtered for mode compatibility. */
  compatibleBoxes: StationOpenBox[];
  onConfirm: () => void;
  onOpenNew: () => void;
}) {
  const mode = modeForItem(scan.item);
  if (mode === "single") {
    return (
      <div className="flex flex-col gap-3">
        <div className={cn("rounded-xl border-[1.5px] p-5", MODE_BG[mode], MODE_BORDER[mode])}>
          {/* 大字 Tag + tracking_no：跟 consolidated 同款 layout */}
          <div className="mb-3 flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-wms-ok-bg px-4 py-1.5 text-lg font-bold text-wms-ok-fg">
              單發
            </span>
            <div className="flex flex-col">
              <span className="font-wms-mono text-xl font-bold tracking-tight">
                {scan.item.tracking_no}
              </span>
              <span className="text-[13px] text-wms-muted">
                {scan.owner.client_name}
              </span>
            </div>
          </div>

          <div className={cn("mb-3 text-[14px]", MODE_FG[mode])}>
            呢件係 <strong>{scan.owner.client_name}</strong> 嘅直發單 · 一單一箱 · 唔需要揀箱
          </div>

          <div className="text-[12px] text-wms-muted mb-2">
            💡 提示：系統自動編號 · 完成裝箱時統一封袋進入秤重隊列
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onConfirm}
              className="inline-flex items-center gap-2 rounded-lg bg-wms-ink px-5 py-3 text-[15px] font-semibold text-white hover:brightness-110"
            >
              <Box size={16} strokeWidth={2.5} />
              入箱 · 自動建箱 · ↵
            </button>
          </div>
        </div>
      </div>
    );
  }
  // consolidated + yt share the same shell
  const isYt = mode === "yt";
  return (
    <div className="flex flex-col gap-3">
      <div className={cn("rounded-xl border-[1.5px] p-5", MODE_BG[mode], MODE_BORDER[mode])}>
        {/* 大字 Tag + tracking_no：倉庫員最先見到呢件貨係咩 mode + 邊條單 */}
        <div className="mb-3 flex items-center gap-3">
          <span className={cn(
            "inline-flex items-center rounded-full px-4 py-1.5 text-lg font-bold",
            mode === "consolidated" && "bg-wms-info-bg text-wms-info-fg",
            mode === "yt" && "bg-purple-100 text-purple-800",
          )}>
            {mode === "consolidated" ? "集運" : "YT"}
          </span>
          <div className="flex flex-col">
            <span className="font-wms-mono text-xl font-bold tracking-tight">
              {scan.item.tracking_no}
            </span>
            <span className="text-[13px] text-wms-muted">
              {isYt ? "YT 香港倉" : scan.owner.client_name}
            </span>
          </div>
        </div>

        <div className={cn("mb-3 text-[14px]", MODE_FG[mode])}>
          {isYt ? (
            <>YT 件 · 唔分客戶 · 全部去 <strong>YT 香港倉</strong> · 任何 YT 箱都可以入</>
          ) : compatibleBoxes.length > 0 ? (
            <>呢件係 <strong>{scan.owner.client_name}</strong> 嘅併箱貨 · 已有 {compatibleBoxes.length} 個開緊箱可入</>
          ) : (
            <>呢件係 <strong>{scan.owner.client_name}</strong> 嘅併箱貨 · 暫時冇兼容嘅開緊箱 · 開新箱裝</>
          )}
        </div>

        {recommended && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-wms-ink-2">下一步 →</span>
            <span
              className={cn(
                "rounded-md border-[1.5px] bg-white px-3 py-1.5 font-wms-mono text-base font-semibold",
                MODE_BORDER[mode]
              )}
            >
              放入 {recommended.box_no}
            </span>
            <span className="text-[13px] text-wms-muted">
              ({recommended.items?.length ?? 0} 件已入箱)
            </span>
          </div>
        )}

        <div className="text-[12px] text-wms-muted mb-2">
          💡 提示：可以直接掃箱號 barcode 入箱（系統會擋唔同客戶 / 唔同 mode 嘅箱）
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {recommended ? (
            <>
              <button
                onClick={onConfirm}
                className="inline-flex items-center gap-2 rounded-lg bg-wms-ink px-5 py-3 text-[15px] font-semibold text-white hover:brightness-110"
              >
                <Check size={16} strokeWidth={2.5} />
                確認入 {recommended.box_no} · ↵
              </button>
              {compatibleBoxes.length > 1 && (
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-wms-border bg-wms-surface px-4 py-3 text-[14px] hover:bg-wms-row-hover">
                  揀其他箱 <ChevronDown size={14} />
                </button>
              )}
              <button
                onClick={onOpenNew}
                className="inline-flex items-center gap-1.5 rounded-lg border border-wms-border bg-wms-surface px-4 py-3 text-[14px] hover:bg-wms-row-hover"
              >
                <Plus size={14} /> 開新箱
              </button>
            </>
          ) : (
            <button
              onClick={onConfirm}
              className="inline-flex items-center gap-2 rounded-lg bg-wms-ink px-5 py-3 text-[15px] font-semibold text-white hover:brightness-110"
            >
              <Plus size={16} strokeWidth={2.5} />
              開新箱 · ↵
            </button>
          )}
        </div>
      </div>
      {/* Alternates — 只列同 mode 兼容嘅箱 */}
      {compatibleBoxes.length > 1 && (
        <div className="rounded-xl border border-wms-border bg-wms-surface p-3">
          <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-wms-faint">
            其他可選箱
          </div>
          <div className="flex flex-col gap-1.5">
            {compatibleBoxes.slice(1).map((b) => {
              const items = b.items?.length ?? 0;
              return (
                <div
                  key={b._id}
                  className="flex items-center gap-2.5 rounded-lg border border-wms-border bg-wms-surface px-2.5 py-2"
                >
                  <span className="font-wms-mono text-sm font-semibold">{b.box_no}</span>
                  <span className="flex-1" />
                  <span className="min-w-[40px] text-right font-wms-mono text-[11.5px] text-wms-muted">
                    {items} 件
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────

export function PackPageClient() {
  const router = useRouter();
  const [state, setState] = React.useState<StationState | null>(null);
  const [scan, setScan] = React.useState<ScanResult | null>(null);
  const [echo, setEcho] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    try {
      const res = await get_request("/api/wms/outbound/pack/state");
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

  const handleScan = async (v: string) => {
    setError(null);
    setBusy(true);
    try {
      const code = v.trim();
      // BOX-* = 箱號掃描：若已有 pending 件 → 入箱 / 換箱（server 會擋
      // mode-mismatch、不同客）；無 pending 件 → 提示先掃件。
      if (/^box-/i.test(code)) {
        if (!scan) {
          throw new Error("請先掃一件貨，再掃箱號");
        }
        const placeRes = await post_request("/api/wms/outbound/pack/place", {
          inbound_id: scan.item.inbound_id,
          outbound_id: scan.item.outbound_id,
          to_box_no: code,
          from_box_no: scan.from_box?.box_no ?? null,
        });
        const placeJson = await placeRes.json();
        if (placeJson?.status !== 200) {
          throw new Error(placeJson?.message ?? "Place failed");
        }
        setScan(null);
        setEcho(null);
        await reload();
        return;
      }
      // 件號掃描
      const res = await post_request("/api/wms/outbound/pack/scan", {
        scanCode: v,
      });
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Scan failed");
      }
      setScan(json.data);
      setEcho(v);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const placeIntoBox = async (boxNo: string) => {
    if (!scan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post_request("/api/wms/outbound/pack/place", {
        inbound_id: scan.item.inbound_id,
        outbound_id: scan.item.outbound_id,
        to_box_no: boxNo,
        from_box_no: scan.from_box?.box_no ?? null,
      });
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Place failed");
      }
      setScan(null);
      setEcho(null);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const openNewBox = async () => {
    if (!scan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post_request("/api/wms/outbound/pack/open-box", {
        inbound_id: scan.item.inbound_id,
        outbound_id: scan.item.outbound_id,
      });
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "Open box failed");
      }
      // 新箱開好之後 → 開窗印箱 label
      const newBoxNo: string | undefined = json?.data?.box?.box_no;
      if (newBoxNo) {
        const clientName = scan.owner.client_name ?? scan.owner.client_code ?? "";
        const printUrl = `/zh-hk/wms/print/box-label?box_no=${encodeURIComponent(
          newBoxNo
        )}&client=${encodeURIComponent(clientName)}`;
        window.open(printUrl, "_blank", "noopener,noreferrer");
      }
      setScan(null);
      setEcho(null);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };


  // 只 recommend 同 mode 兼容嘅箱：consolidated 唔可以入 single_direct 箱，
  // YT 唔可以入 non-YT 箱，反之亦然。後端 placeItem 都會 reject，但 frontend
  // 要先過濾，唔好俾倉庫員見到「已有 N 個可入」但 click 落去 reject 嘅錯覺。
  const compatibleOwnerBoxes: StationOpenBox[] = React.useMemo(() => {
    if (!scan) return [];
    const wanted = modeForItem(scan.item);
    return (scan.owner.open_boxes ?? []).filter(
      (b) => modeForBox(b) === wanted
    );
  }, [scan]);
  const recommended: StationOpenBox | null = compatibleOwnerBoxes[0] ?? null;

  const deskCount = state?.desk?.length ?? 0;
  const ctaState: "locked" | "ready" =
    deskCount === 0 && state ? "ready" : "locked";

  const [completeConfirmOpen, setCompleteConfirmOpen] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);
  const openBoxCount = state?.stats.open_box_count ?? 0;

  const handleCompletePacking = async () => {
    setCompleting(true);
    setError(null);
    try {
      const res = await post_request(
        "/api/wms/outbound/pack/complete-session",
        {}
      );
      const json = await res.json();
      if (json?.status !== 200) {
        throw new Error(json?.message ?? "完成裝箱失敗");
      }
      setCompleteConfirmOpen(false);
      router.push("/zh-hk/wms/operations/weigh");
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setCompleteConfirmOpen(false);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <>
    <WmsShell
      crumbs={[{ label: "出貨作業" }, { label: "裝箱任務" }]}
      cta={
        <NextCTA
          state={ctaState}
          to="pack"
          progress={
            state
              ? { done: state.stats.packed_item_count, total: state.stats.packed_item_count + deskCount }
              : undefined
          }
          lockedHint={deskCount > 0 ? `仲有 ${deskCount} 件未入箱` : undefined}
          back={{ url: "/zh-hk/wms/operations/pick-batch", label: "揀貨任務" }}
          customMainCTA={
            ctaState === "ready" ? (
              <button
                onClick={() => setCompleteConfirmOpen(true)}
                disabled={completing}
                className="animate-wms-cta-pulse inline-flex items-center gap-2.5 whitespace-nowrap rounded-[12px] bg-wms-brand px-[26px] py-3.5 text-[16px] font-semibold text-white transition-all hover:scale-[1.03] motion-reduce:animate-none disabled:opacity-60"
              >
                <span>完成裝箱 · 去秤重取單</span>
                <ArrowRight size={18} strokeWidth={2.5} />
                <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 font-wms-mono text-[11px] font-medium">
                  ↵
                </span>
              </button>
            ) : undefined
          }
        />
      }
    >
      <div className="flex h-full flex-col px-5 py-3.5">
        <div className="mb-2.5 flex items-center gap-3 rounded-xl border border-wms-border bg-wms-surface-alt px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-wms-faint">
            出貨流程
          </span>
          <Stepper steps={STEPPER} />
          <span className="flex-1" />
          {state && (
            <span className="text-xs text-wms-muted">
              已入 <strong className="font-wms-mono">{state.stats.packed_item_count}</strong> · 待{" "}
              <strong className="font-wms-mono">{deskCount}</strong>
            </span>
          )}
        </div>

        <div className="mb-3 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">裝箱任務</h1>
          <Pill kind="muted">
            {state ? `${state.stats.open_box_count} 個開緊箱 · ${deskCount} 件待入箱` : "載入中…"}
          </Pill>
          <span className="flex-1" />
          <button className="inline-flex items-center gap-1.5 rounded-md border border-wms-border bg-wms-surface px-2.5 py-1 text-xs hover:bg-wms-row-hover">
            <Sparkles size={13} /> 重組模式
          </button>
        </div>

        {error && (
          <div className="mb-2 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-3 py-2 text-sm text-wms-danger-fg">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-3">
          {/* LEFT: desk */}
          <div className="flex w-[320px] flex-none flex-col overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
            <div className="flex items-center gap-1.5 border-b border-wms-border px-3 py-2.5">
              <h3 className="text-[13px] font-semibold">在桌面</h3>
              <Pill kind="muted">{deskCount} 件</Pill>
              <span className="flex-1" />
              <span className="text-[11px] text-wms-faint">按 mode 排序</span>
            </div>
            <div className="flex-1 overflow-auto p-2.5">
              {state?.desk?.length === 0 && (
                <div className="rounded-md bg-wms-surface-alt p-4 text-center text-xs text-wms-faint">
                  桌面已空 · 等下一輪揀貨完成
                </div>
              )}
              {state?.desk?.map((it) => (
                <DeskRow
                  key={it.inbound_id}
                  item={it}
                  active={scan?.item.inbound_id === it.inbound_id}
                  onClick={() => handleScan(it.tracking_no)}
                />
              ))}
            </div>
          </div>

          {/* MID: in-hand */}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-auto">
            <Scanner
              placeholder="掃下一件貨 · 系統自動辨認 併箱 / 單發 / YT"
              echo={echo ?? undefined}
              onScan={handleScan}
            />
            {!scan ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-wms-border bg-wms-surface text-sm text-wms-faint">
                掃一件貨開始裝箱
              </div>
            ) : (
              <MidHero
                scan={scan}
                recommended={recommended}
                compatibleBoxes={compatibleOwnerBoxes}
                onConfirm={() => {
                  // single 一單一箱：直接 open 新箱（封袋延後到「完成裝箱」一齊做）
                  // consolidated/yt：有推薦現成箱就入，冇就由 onOpenNew 處理
                  if (scan.item.shipment_type === "single") {
                    openNewBox();
                  } else if (recommended) {
                    placeIntoBox(recommended.box_no);
                  } else {
                    openNewBox();
                  }
                }}
                onOpenNew={openNewBox}
              />
            )}
          </div>

          {/* RIGHT: boxes */}
          <div className="flex w-[320px] flex-none flex-col overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
            <div className="flex items-center gap-1.5 border-b border-wms-border px-3 py-2.5">
              <h3 className="text-[13px] font-semibold">進行中嘅箱</h3>
              <Pill kind="muted">{state?.open_boxes?.length ?? 0} 個</Pill>
              <span className="flex-1" />
              {scan && (
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase",
                    MODE_FG[modeForItem(scan.item)]
                  )}
                >
                  過濾: {modeForItem(scan.item)}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto p-2.5">
              {state && scan ? (
                (() => {
                  const wanted = modeForItem(scan.item);
                  const wantedClient =
                    wanted === "yt" ? SYSTEM_CLIENT_ID : scan.owner.client_id;
                  const eligible = state.open_boxes.filter(
                    (b) => modeForBox(b) === wanted && b.client_id === wantedClient
                  );
                  const others = state.open_boxes.filter(
                    (b) => !eligible.includes(b)
                  );
                  return (
                    <>
                      <div
                        className={cn(
                          "mb-1.5 text-[11px] font-semibold uppercase tracking-wider",
                          MODE_FG[wanted]
                        )}
                      >
                        可入
                      </div>
                      {eligible.length === 0 ? (
                        <div className="mb-2 rounded-md bg-wms-surface-alt p-2 text-center text-[11px] text-wms-faint">
                          冇現成箱 · 開新箱
                        </div>
                      ) : (
                        eligible.map((b, i) => (
                          <BoxCard
                            key={b._id}
                            box={b}
                            recommended={i === 0}
                            onClickPlace={() => placeIntoBox(b.box_no)}
                          />
                        ))
                      )}
                      {others.length > 0 && (
                        <>
                          <div className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-wms-faint">
                            唔可入
                          </div>
                          {others.map((b) => (
                            <BoxCard key={b._id} box={b} dimmed />
                          ))}
                        </>
                      )}
                    </>
                  );
                })()
              ) : state ? (
                state.open_boxes.length === 0 ? (
                  <div className="rounded-md bg-wms-surface-alt p-4 text-center text-xs text-wms-faint">
                    暫無開箱
                  </div>
                ) : (
                  state.open_boxes.map((b) => <BoxCard key={b._id} box={b} />)
                )
              ) : (
                <div className="rounded-md bg-wms-surface-alt p-4 text-center text-xs text-wms-faint">
                  載入中…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </WmsShell>
    <AlertDialog open={completeConfirmOpen} onOpenChange={setCompleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>完成裝箱？</AlertDialogTitle>
          <AlertDialogDescription>
            桌面已清空，{openBoxCount} 個開緊嘅箱會被自動封箱（空箱會取消），所有 outbound 狀態會推到 <strong>packed</strong> 並進入秤重 queue。
            <br />
            <br />
            確認所有貨件已正確入箱？呢個動作之後唔可以再加件入箱。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={completing}>返回繼續裝箱</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleCompletePacking();
            }}
            disabled={completing}
          >
            {completing ? "處理中…" : "確認完成 · 去秤重取單"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

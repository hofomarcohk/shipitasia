// W6 — 桌面裝箱 workbench model (Direction A redesign).
//
// Mental model: left = 桌面手邊貨, right = 箱. The scanned item renders
// as a full-width HERO CARD (mode-coloured 3px border + huge badge)
// whose right side states the next action:
//   single        → 一單一箱 · Enter 自動建箱
//   consolidated  → 建議入 BOX-xxx · Enter 接受；掃其他箱條碼即入該箱
//   yt            → 任何 YT 箱可入，同上
// The ONLY button on the bench is「＋ 開新箱」— placing into an
// existing box is scan-driven (BOX-* barcode) or Enter-accept.
//
// All handlers / API flow are unchanged from the pre-redesign page:
// scan → /pack/scan, place → /pack/place, new box → /pack/open-box
// (auto-opens box-label print), complete → /pack/complete-session.

"use client";

import { ArrowRight, Box, Plus, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { ModeBadge, type Mode } from "@/components/wms-redesign/mode-badge";
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

// Direction A hero-card border / shadow per mode
const HERO_BORDER: Record<Mode, string> = {
  consolidated:
    "border-wms-info-fg shadow-[5px_5px_0_rgba(46,98,166,0.18)]",
  single: "border-wms-warn-fg shadow-[5px_5px_0_rgba(200,105,10,0.18)]",
  yt: "border-wms-ok-strong shadow-[5px_5px_0_rgba(21,122,66,0.18)]",
};
const MODE_TEXT: Record<Mode, string> = {
  consolidated: "text-wms-info-fg",
  single: "text-wms-warn-fg",
  yt: "text-wms-ok-fg",
};

function Keycap({ children = "↵", sm }: { children?: React.ReactNode; sm?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-[2px] bg-wms-ink font-wms-mono font-bold leading-[1.2] text-wms-bg",
        sm ? "px-[7px] py-[2px] text-[12px]" : "px-2.5 py-[3px] text-[15px]"
      )}
    >
      {children}
    </span>
  );
}

// ── hero scan card ────────────────────────────────────────
function HeroScanCard({
  scan,
  recommended,
}: {
  scan: ScanResult;
  recommended: StationOpenBox | null;
}) {
  const mode = modeForItem(scan.item);
  return (
    <div
      className={cn(
        "flex items-center gap-5 rounded-[3px] border-[3px] bg-wms-surface px-5 py-3.5",
        HERO_BORDER[mode]
      )}
    >
      <ModeBadge mode={mode} huge />
      <div className="min-w-0 flex-1">
        <div className="truncate font-wms-mono text-[27px] font-bold tracking-[0.01em]">
          {scan.item.tracking_no}
        </div>
        <div className="mt-0.5 text-[14px] font-semibold text-wms-ink-2">
          {mode === "yt" ? "YT 香港倉" : scan.owner.client_name} ·{" "}
          <span className="font-wms-mono text-[13px] text-wms-faint">
            {scan.item.outbound_id}
          </span>
        </div>
      </div>
      <div className="flex flex-none flex-col items-end gap-1.5 text-right">
        {mode === "single" ? (
          <>
            <div className="flex items-center gap-2.5 font-wms-disp text-[18px] font-extrabold">
              一單一箱 → 入箱 · 自動建箱 <Keycap />
            </div>
            <div className="flex items-center gap-1.5 text-[13px] text-wms-faint">
              按 Enter 即自動建箱 — 無需選箱
            </div>
          </>
        ) : recommended ? (
          <>
            <div className="flex items-center gap-2.5 font-wms-disp text-[18px] font-extrabold">
              建議入{" "}
              <span className="font-wms-mono">{recommended.box_no}</span>{" "}
              <Keycap />
            </div>
            <div className="flex items-center gap-1.5 text-[13px] text-wms-faint">
              <ScanLine size={13} />
              要入其他箱？直接掃描該箱的條碼即可
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 font-wms-disp text-[18px] font-extrabold">
              {mode === "yt" ? "未有 YT 箱 → 開新箱" : "無現成箱 → 開新箱"}{" "}
              <Keycap />
            </div>
            <div className="flex items-center gap-1.5 text-[13px] text-wms-faint">
              按 Enter 即開新箱並列印箱標籤
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── box card (bench right) ────────────────────────────────
function BoxCard({
  box,
  recommended,
  eligible,
  ghostItem,
  onPlace,
}: {
  box: StationOpenBox;
  recommended?: boolean;
  eligible?: boolean;
  /** Tracking no of the in-hand item previewed into the recommended box. */
  ghostItem?: string | null;
  onPlace?: () => void;
}) {
  const mode = modeForBox(box);
  const items = box.items ?? [];
  return (
    <div
      onClick={eligible && onPlace ? onPlace : undefined}
      className={cn(
        "flex flex-col gap-2 rounded-[3px] border-[1.5px] bg-wms-surface p-3",
        recommended
          ? "border-[2.5px] border-wms-brand shadow-[4px_4px_0_rgba(58,111,181,0.18)]"
          : "border-wms-border-strong",
        eligible && onPlace && "cursor-pointer hover:bg-wms-row-hover",
        !eligible && !recommended && "opacity-50"
      )}
    >
      <div className="flex items-center gap-2 text-wms-ink-2">
        <Box size={15} />
        <span className="font-wms-mono text-[14px] font-bold text-wms-ink">
          {box.box_no}
        </span>
        <span className="flex-1" />
        {recommended ? (
          <Pill kind="brand">建議入此箱</Pill>
        ) : (
          <Pill kind="warn-soft">未封</Pill>
        )}
      </div>
      <div className="flex items-center gap-2 text-[13px] font-bold">
        <ModeBadge mode={mode} />
        {box.client_code}
      </div>
      <div className="flex flex-col gap-1 border-t border-wms-border pt-2">
        {items.slice(0, 5).map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[12.5px]">
            <span className="inline-flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full bg-wms-ok-strong text-[9.5px] font-extrabold text-white">
              ✓
            </span>
            <span className="truncate font-wms-mono">{p.tracking_no}</span>
          </div>
        ))}
        {items.length > 5 && (
          <span className="text-[11px] text-wms-faint">
            +{items.length - 5} 件
          </span>
        )}
        {ghostItem && (
          <div className="flex items-center gap-2 rounded-[2px] border-[1.5px] border-dashed border-wms-brand bg-wms-info-bg px-1.5 py-[3px] text-[12.5px] text-wms-brand">
            <span className="inline-flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full bg-wms-brand text-[11px] font-extrabold text-white">
              +
            </span>
            <span className="truncate font-wms-mono font-bold text-wms-info-fg">
              {ghostItem}
            </span>
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-wms-border pt-2 text-[12.5px]">
        <span className="text-wms-faint">
          <span className="font-wms-mono">{items.length}</span> 件
        </span>
        {recommended ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-wms-brand">
            確認入此箱 <Keycap sm>↵</Keycap>
          </span>
        ) : eligible ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-wms-faint">
            <ScanLine size={13} /> 掃箱條碼入此箱
          </span>
        ) : null}
      </div>
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
      // BOX-* 條碼：已有在手件 → 入箱／換箱（server 會阻擋不同模式、
      // 不同客戶的箱）；未掃件 → 提示先掃件。
      if (/^box-/i.test(code)) {
        if (!scan) {
          throw new Error("請先掃描一件貨，再掃描箱條碼");
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
      // 新箱建立後 → 開新分頁列印箱標籤
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

  // 只建議模式兼容的箱：集運不可入單發專箱、YT 不可入非 YT 箱，
  // 反之亦然。後端 placeItem 亦會阻擋；前端先過濾避免誤導。
  const compatibleOwnerBoxes: StationOpenBox[] = React.useMemo(() => {
    if (!scan) return [];
    const wanted = modeForItem(scan.item);
    return (scan.owner.open_boxes ?? []).filter(
      (b) => modeForBox(b) === wanted
    );
  }, [scan]);
  const recommended: StationOpenBox | null = compatibleOwnerBoxes[0] ?? null;

  // Enter-accept：在手件存在且掃描欄空白時，Enter＝接受建議
  // （single→自動建箱；有建議箱→入建議箱；否則開新箱）。
  const confirmCurrent = React.useCallback(() => {
    if (!scan || busy) return;
    if (modeForItem(scan.item) === "single") {
      openNewBox();
    } else if (recommended) {
      placeIntoBox(recommended.box_no);
    } else {
      openNewBox();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, recommended, busy]);

  React.useEffect(() => {
    if (!scan) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
        const v = (t as HTMLInputElement).value;
        if (v && v.trim() !== "") return; // scanner 有內容 → 由 scanner 處理
      }
      e.preventDefault();
      confirmCurrent();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scan, confirmCurrent]);

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

  // bench right: in-hand 時按兼容性分組
  const wanted = scan ? modeForItem(scan.item) : null;
  const wantedClient =
    scan && wanted
      ? wanted === "yt"
        ? SYSTEM_CLIENT_ID
        : scan.owner.client_id
      : null;
  const isEligible = (b: StationOpenBox) =>
    !!scan &&
    modeForBox(b) === wanted &&
    (wanted === "yt" || b.client_id === wantedClient);

  return (
    <>
    <WmsShell
      crumbs={[{ label: "出貨作業" }, { label: "桌面裝箱" }]}
      cta={
        <NextCTA
          state={ctaState}
          to="pack"
          progress={
            state
              ? { done: state.stats.packed_item_count, total: state.stats.packed_item_count + deskCount }
              : undefined
          }
          lockedHint={deskCount > 0 ? `尚有 ${deskCount} 件未入箱` : undefined}
          back={{ url: "/zh-hk/wms/operations/pick-batch", label: "揀貨批次" }}
          customMainCTA={
            ctaState === "ready" ? (
              <button
                onClick={() => setCompleteConfirmOpen(true)}
                disabled={completing}
                className="animate-wms-cta-pulse inline-flex items-center gap-2.5 whitespace-nowrap rounded-[3px] bg-wms-ok-strong px-6 py-[11px] font-wms-disp text-[15.5px] font-extrabold tracking-[0.02em] text-white hover:brightness-110 motion-reduce:animate-none disabled:opacity-60"
              >
                <span>完成裝箱 · 去秤重取單</span>
                <ArrowRight size={17} strokeWidth={2.5} />
                <span className="rounded-[2px] border border-white/45 bg-white/20 px-[7px] py-[2px] font-wms-mono text-[12px] font-medium">
                  ↵
                </span>
              </button>
            ) : undefined
          }
        />
      }
    >
      <div className="flex h-full flex-col px-5 py-3.5">
        <div className="mb-3 flex items-end gap-3">
          <div>
            <h1 className="font-wms-disp text-[24px] font-extrabold tracking-[0.01em]">
              桌面裝箱
            </h1>
            <div className="mt-0.5 text-[12.5px] text-wms-muted">
              左＝桌面手邊貨 · 右＝箱 — ↵ 入建議箱；掃箱條碼入指定箱；唯一按鍵＝開新箱
            </div>
          </div>
          <span className="flex-1" />
          <Stepper steps={outboundSteps(1)} />
          {state && (
            <span className="text-xs text-wms-muted">
              已入箱 <strong className="font-wms-mono">{state.stats.packed_item_count}</strong> · 待入{" "}
              <strong className="font-wms-mono">{deskCount}</strong>
            </span>
          )}
        </div>

        {error && (
          <div className="mb-2 rounded-[3px] bg-wms-danger px-3 py-2 text-[13px] font-semibold text-white">
            {error}
          </div>
        )}

        <div className="mb-3">
          <Scanner
            placeholder="掃描桌面上的件 · 系統自動辨識 集運 / 單發 / YT"
            echo={echo ?? undefined}
            onScan={handleScan}
          />
        </div>

        {scan && (
          <div className="mb-3">
            <HeroScanCard scan={scan} recommended={recommended} />
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr] gap-3">
          {/* LEFT: desk */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-wms-border bg-wms-surface">
            <div className="flex items-center gap-1.5 border-b border-wms-border px-3 py-2.5">
              <h3 className="font-wms-disp text-[12px] font-bold tracking-[0.1em] text-wms-ink-2">
                桌面 · 手邊貨
              </h3>
              <Pill kind={deskCount > 0 ? "warn-soft" : "ok-soft"}>
                剩 {deskCount} 件
              </Pill>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {state?.desk?.length === 0 && (
                <div className="rounded-[3px] bg-wms-surface-alt p-4 text-center text-xs text-wms-faint">
                  桌面已清空 · 等待下一輪揀貨完成
                </div>
              )}
              {state?.desk?.map((it) => {
                const active = scan?.item.inbound_id === it.inbound_id;
                return (
                  <div
                    key={it.inbound_id}
                    onClick={() => handleScan(it.tracking_no)}
                    className={cn(
                      "mb-1 flex cursor-pointer items-center gap-2.5 rounded-[3px] border px-2.5 py-2",
                      active
                        ? "border-wms-warn-fg bg-wms-warn-bg shadow-[inset_3px_0_0_#C8690A]"
                        : "border-transparent hover:bg-wms-row-hover"
                    )}
                  >
                    <ModeBadge mode={modeForItem(it)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-wms-mono text-[12.5px] font-semibold">
                        {it.tracking_no}
                      </div>
                      <div className="truncate text-[11.5px] text-wms-muted">
                        {it.client_name}
                      </div>
                    </div>
                    {active && <Pill kind="warn">掃描中</Pill>}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-wms-border px-3 py-2.5 text-[12.5px] font-semibold text-wms-faint">
              今日已入箱{" "}
              <span className="font-wms-mono">
                {state?.stats.packed_item_count ?? 0}
              </span>{" "}
              件
            </div>
          </div>

          {/* RIGHT: boxes bench */}
          <div className="flex min-w-0 flex-col gap-2 overflow-auto">
            <div className="font-wms-disp text-[12px] font-bold tracking-[0.12em] text-wms-ink-2">
              未封箱 · {state?.open_boxes?.length ?? 0}
            </div>
            <div className="grid grid-cols-2 gap-2.5 2xl:grid-cols-3">
              {(state?.open_boxes ?? []).map((b) => {
                const rec = !!scan && recommended?._id === b._id && wanted !== "single";
                const eligible = isEligible(b) && !rec;
                return (
                  <BoxCard
                    key={b._id}
                    box={b}
                    recommended={rec}
                    eligible={scan ? eligible : true}
                    ghostItem={rec ? scan!.item.tracking_no : null}
                    onPlace={
                      scan && (rec || eligible)
                        ? () => placeIntoBox(b.box_no)
                        : undefined
                    }
                  />
                );
              })}
              {/* new-box card */}
              {scan && wanted === "single" ? (
                <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[3px] border-[2.5px] border-dashed border-wms-warn-fg bg-wms-warn-bg p-3 text-wms-warn-fg">
                  <div className="text-[14px] font-bold">
                    自動建箱 · 單發專箱
                  </div>
                  <span className="font-wms-mono text-[12px] opacity-80">
                    {scan.item.tracking_no}
                  </span>
                  <button
                    onClick={openNewBox}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-[13px] font-extrabold"
                  >
                    入箱 · 自動建箱 <Keycap sm>↵</Keycap>
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[3px] border-[1.5px] border-dashed border-wms-border-strong p-3 text-wms-faint">
                  <button
                    onClick={openNewBox}
                    disabled={!scan || busy}
                    className="inline-flex items-center gap-1.5 rounded-[3px] bg-wms-brand px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
                  >
                    <Plus size={14} /> 開新箱
                  </button>
                  <div className="text-center text-[11.5px]">
                    入現有箱無需按鍵 — 掃描箱條碼即可
                  </div>
                </div>
              )}
            </div>

            <div className="mt-auto border-t border-wms-border pt-2.5 text-[11.5px] text-wms-faint">
              規則：集運同客戶才可同箱 · YT 件可互通 cross 箱 · YT 與集運／單發混箱會被系統阻擋
            </div>
          </div>
        </div>
      </div>
    </WmsShell>
    <AlertDialog open={completeConfirmOpen} onOpenChange={setCompleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-wms-danger">完成裝箱？</AlertDialogTitle>
          <AlertDialogDescription>
            桌面已清空。{openBoxCount} 個未封箱將自動封箱（空箱會取消），所有出庫單狀態推進至 <strong>packed</strong> 並進入秤重佇列。
            <br />
            <br />
            確認所有貨件已正確入箱？此步驟之後不可再加件入箱。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={completing}>返回繼續裝箱</AlertDialogCancel>
          <AlertDialogAction
            autoFocus
            onClick={(e) => {
              e.preventDefault();
              handleCompletePacking();
            }}
            disabled={completing}
          >
            {completing ? "處理中…" : "確認 · 去秤重取單 ↵"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

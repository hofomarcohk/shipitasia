"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { get_request, post_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import {
  IconBattery,
  IconBox,
  IconCheck,
  IconDroplet,
  IconScan,
  IconX,
} from "@tabler/icons-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── Types (shape from /api/wms/outbound/pack/state) ────────────────────

type DeskItem = {
  inbound_id: string;
  outbound_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  tracking_no: string;
  product_name: string | null;
  shipment_type: "single" | "consolidated";
  declared_items_count: number;
  contains_battery: boolean;
  contains_liquid: boolean;
};

type OpenBoxItem = {
  inbound_id: string;
  outbound_id: string;
  tracking_no: string;
  product_name: string | null;
  client_id: string;
  client_code: string;
  client_name: string;
  contains_battery: boolean;
  contains_liquid: boolean;
};

type OpenBox = {
  _id: string;
  box_no: string;
  client_id: string;
  client_code: string;
  client_name?: string;
  is_single_direct: boolean;
  items: OpenBoxItem[];
  max_slots: number;
  opened_at: string;
};

type StationState = {
  desk: DeskItem[];
  open_boxes: OpenBox[];
  stats: { desk_count: number; open_box_count: number; packed_item_count: number };
};

type ScanResult = {
  mode: "place" | "swap";
  item: {
    inbound_id: string;
    outbound_id: string;
    tracking_no: string;
    product_name: string | null;
    shipment_type: "single" | "consolidated";
  };
  owner: {
    client_id: string;
    client_code: string;
    client_name: string;
    desk_count: number;
    related_outbounds: { outbound_id: string; inbound_count: number }[];
    open_boxes: OpenBox[];
  };
  from_box?: OpenBox;
};

async function apiJson<T>(
  method: "GET" | "POST",
  url: string,
  body?: any
): Promise<{ ok: boolean; data?: T; message?: string }> {
  const res =
    method === "GET" ? await get_request(url, body) : await post_request(url, body);
  const json = await res.json().catch(() => ({}));
  if (res.status !== 200 || json.status !== 200) {
    return { ok: false, message: json.message || `HTTP ${res.status}` };
  }
  return { ok: true, data: json.data as T };
}

function openPrintPopup(boxNo: string, clientLabel: string, isSingleDirect = false) {
  const qs = new URLSearchParams({
    box_no: boxNo,
    client: clientLabel,
    ...(isSingleDirect ? { variant: "single" } : {}),
  });
  const loc =
    typeof window !== "undefined"
      ? window.location.pathname.split("/")[1] || "zh-hk"
      : "zh-hk";
  window.open(`/${loc}/wms/print/box-label?${qs.toString()}`, "_blank");
}

// ── Sub-components ────────────────────────────────────────────────────

function FlagChips({
  battery,
  liquid,
}: {
  battery: boolean;
  liquid: boolean;
}) {
  if (!battery && !liquid) return null;
  return (
    <span className="inline-flex gap-1 ml-1 align-middle">
      {battery && (
        <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-px">
          <IconBattery size={10} /> 電
        </span>
      )}
      {liquid && (
        <span className="inline-flex items-center gap-0.5 text-[9px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-1 py-px">
          <IconDroplet size={10} /> 液
        </span>
      )}
    </span>
  );
}

function DeskItemRow({
  item,
  onTap,
}: {
  item: DeskItem;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className="w-full bg-white border rounded p-2 text-left active:bg-gray-50 flex items-start gap-2"
    >
      <span className="text-[9px] font-mono uppercase bg-gray-100 border rounded px-1 py-px text-gray-600 mt-0.5">
        {item.client_code}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs font-bold truncate">
          {item.tracking_no}
        </div>
        <div className="text-[11px] text-gray-600 truncate">
          {item.product_name || "—"} · {item.client_name}
          <FlagChips
            battery={item.contains_battery}
            liquid={item.contains_liquid}
          />
        </div>
      </div>
      {item.shipment_type === "single" && (
        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 rounded px-1 py-px shrink-0">
          直發
        </span>
      )}
    </button>
  );
}

function BoxedItemRow({
  item,
  boxNo,
  onTap,
}: {
  item: OpenBoxItem;
  boxNo: string;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className="w-full bg-white border rounded p-2 text-left active:bg-gray-50 flex items-start gap-2"
    >
      <span className="text-[9px] font-mono uppercase bg-gray-100 border rounded px-1 py-px text-gray-600 mt-0.5">
        {item.client_code}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs font-bold truncate">
          {item.tracking_no}
        </div>
        <div className="text-[11px] text-gray-600 truncate">
          {item.product_name || "—"} · {item.client_name}
          <FlagChips
            battery={item.contains_battery}
            liquid={item.contains_liquid}
          />
        </div>
      </div>
      <span className="text-[10px] font-mono bg-blue-50 text-blue-800 border border-blue-200 rounded px-1.5 py-px shrink-0">
        {boxNo}
      </span>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────

export function PdaPack() {
  const router = useRouter();
  const locale = useLocale();
  const [view, setView] = useState<"scan" | "boxes">("scan");
  const [state, setState] = useState<StationState>({
    desk: [],
    open_boxes: [],
    stats: { desk_count: 0, open_box_count: 0, packed_item_count: 0 },
  });

  const [scanCode, setScanCode] = useState("");
  const [inHand, setInHand] = useState<ScanResult | null>(null);
  const [modalBoxScan, setModalBoxScan] = useState("");
  const [modalErr, setModalErr] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const modalBoxScanRef = useRef<HTMLInputElement>(null);
  const msgTimer = useRef<any>(null);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 2600);
  }, []);

  const refresh = useCallback(async () => {
    const r = await apiJson<StationState>("GET", "/api/wms/outbound/pack/state");
    if (r.ok && r.data) setState(r.data);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Flattened boxed items with box reference (for "已集箱" list)
  const boxedRows = useMemo(() => {
    const rows: { item: OpenBoxItem; box_no: string; box: OpenBox }[] = [];
    for (const b of state.open_boxes) {
      for (const it of b.items) rows.push({ item: it, box_no: b.box_no, box: b });
    }
    return rows;
  }, [state.open_boxes]);

  async function doScan(codeOverride?: string) {
    const code = (codeOverride ?? scanCode).trim();
    if (!code) return;
    const r = await apiJson<ScanResult>("POST", "/api/wms/outbound/pack/scan", {
      scanCode: code,
    });
    if (!r.ok || !r.data) {
      flash("err", r.message || `掃描失敗：${code}`);
      setScanCode("");
      return;
    }
    setInHand(r.data);
    setScanCode("");
    setModalBoxScan("");
    setModalErr("");
    setTimeout(() => modalBoxScanRef.current?.focus(), 80);
  }

  async function doOpenNewBox() {
    if (!inHand) return;
    const r = await apiJson<{ box: OpenBox; printPayload: any }>(
      "POST",
      "/api/wms/outbound/pack/open-box",
      {
        inbound_id: inHand.item.inbound_id,
        outbound_id: inHand.item.outbound_id,
        from_box_no: inHand.from_box?.box_no || null,
      }
    );
    if (!r.ok || !r.data) {
      flash("err", r.message || "開新箱失敗");
      return;
    }
    openPrintPopup(
      r.data.box.box_no,
      inHand.owner.client_name,
      inHand.item.shipment_type === "single"
    );
    flash("ok", `已開新箱 ${r.data.box.box_no}`);
    setInHand(null);
    setModalBoxScan("");
    setModalErr("");
    await refresh();
    setTimeout(() => scanInputRef.current?.focus(), 80);
  }

  async function doPlace(box: OpenBox) {
    if (!inHand) return;
    const r = await apiJson("POST", "/api/wms/outbound/pack/place", {
      inbound_id: inHand.item.inbound_id,
      outbound_id: inHand.item.outbound_id,
      to_box_no: box.box_no,
      from_box_no: inHand.from_box?.box_no || null,
    });
    if (!r.ok) {
      flash("err", r.message || "放入失敗");
      return;
    }
    flash(
      "ok",
      inHand.from_box
        ? `${inHand.item.tracking_no} : ${inHand.from_box.box_no} → ${box.box_no}`
        : `${inHand.item.tracking_no} → ${box.box_no}`
    );
    setInHand(null);
    setModalBoxScan("");
    setModalErr("");
    await refresh();
    setTimeout(() => scanInputRef.current?.focus(), 80);
  }

  // From the in-hand modal, scan a box barcode and place directly.
  async function submitModalBoxScan() {
    if (!inHand) return;
    const t = modalBoxScan.trim().toUpperCase();
    if (!t) return;
    const match = state.open_boxes.find((b) => b.box_no.toUpperCase() === t);
    if (!match) {
      setModalErr(`找不到「${modalBoxScan}」這個箱`);
      return;
    }
    if (match.client_id !== inHand.owner.client_id) {
      setModalErr(`${match.box_no} 屬於其他客戶`);
      return;
    }
    if (match.is_single_direct) {
      setModalErr(`${match.box_no} 是直發箱，不可拼入`);
      return;
    }
    if (match.items.length >= match.max_slots) {
      setModalErr(`${match.box_no} 已滿`);
      return;
    }
    if (match.box_no === inHand.from_box?.box_no) {
      setModalErr(`${match.box_no} 是原箱，不需要換`);
      return;
    }
    await doPlace(match);
  }

  async function doSeal(boxNo: string) {
    if (!confirm(`封箱 ${boxNo}？`)) return;
    const r = await apiJson("POST", "/api/wms/outbound/pack/seal-box", {
      box_no: boxNo,
    });
    if (!r.ok) {
      flash("err", r.message || "封箱失敗");
      return;
    }
    flash("ok", `${boxNo} 已封箱`);
    await refresh();
  }

  async function doCancelBox(boxNo: string) {
    if (!confirm(`撤銷 ${boxNo}？所有件回桌面`)) return;
    const r = await apiJson("POST", "/api/wms/outbound/pack/cancel-box", {
      box_no: boxNo,
    });
    if (!r.ok) {
      flash("err", r.message || "撤銷失敗");
      return;
    }
    flash("ok", `${boxNo} 已撤銷`);
    await refresh();
  }

  async function doCompleteSession() {
    if (state.open_boxes.length === 0) {
      flash("err", "未開任何箱 — 無需完成裝箱");
      return;
    }
    const emptyCount = state.open_boxes.filter((b) => b.items.length === 0).length;
    const withItemsCount = state.open_boxes.length - emptyCount;
    const prompt =
      `確定完成裝箱？\n\n` +
      `• 將封箱 ${withItemsCount} 個有貨件的箱\n` +
      (emptyCount > 0 ? `• 將撤銷 ${emptyCount} 個空箱\n` : "") +
      `\n之後轉去複重置板。`;
    if (!confirm(prompt)) return;
    const r = await apiJson<{ sealed: string[]; cancelled: string[] }>(
      "POST",
      "/api/wms/outbound/pack/complete-session"
    );
    if (!r.ok || !r.data) {
      flash("err", r.message || "完成裝箱失敗");
      return;
    }
    flash(
      "ok",
      `已封箱 ${r.data.sealed.length} 個 · ` +
        (r.data.cancelled.length > 0
          ? `撤銷 ${r.data.cancelled.length} 個 · `
          : "") +
        `轉去複重置板…`
    );
    await refresh();
    setTimeout(() => {
      router.push(`/${locale}/wms/operations/weigh`);
    }, 1400);
  }

  return (
    <div className="flex flex-col h-full">
      {/* 2-tab strip */}
      <div className="flex border-b bg-white sticky top-0 z-10">
        <button
          className={cn(
            "flex-1 py-3 text-sm font-medium border-b-2",
            view === "scan"
              ? "border-black text-black"
              : "border-transparent text-gray-500"
          )}
          onClick={() => setView("scan")}
        >
          <IconScan size={16} className="inline mr-1" />
          掃包
        </button>
        <button
          className={cn(
            "flex-1 py-3 text-sm font-medium border-b-2",
            view === "boxes"
              ? "border-black text-black"
              : "border-transparent text-gray-500"
          )}
          onClick={() => setView("boxes")}
        >
          <IconBox size={16} className="inline mr-1" />
          集箱狀態 ({state.stats.open_box_count})
        </button>
      </div>

      <div className="px-3 py-3 space-y-3 flex-1 overflow-auto pb-24">
        {view === "scan" && (
          <>
            {/* Sticky scan input */}
            <div className="bg-white border rounded p-3 space-y-2 sticky top-12 z-[5]">
              <div className="text-xs text-gray-500 uppercase tracking-wide font-mono">
                掃描 tracking barcode
              </div>
              <Input
                ref={scanInputRef}
                autoFocus
                value={scanCode}
                placeholder="輸入或掃描 tracking no…"
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doScan();
                }}
              />
              <Button
                className="w-full"
                onClick={() => doScan()}
                disabled={!scanCode.trim()}
              >
                掃描
              </Button>
            </div>

            {/* Group: 未進箱 */}
            <div>
              <div className="px-1 mb-1.5 text-[11px] uppercase tracking-wide font-mono text-gray-500 flex justify-between">
                <span>
                  未進箱 · <b className="text-gray-900">{state.desk.length}</b>
                </span>
                <span>tap = 開始集包</span>
              </div>
              <div className="space-y-1.5">
                {state.desk.length === 0 ? (
                  <div className="text-center text-gray-400 text-xs py-3 border border-dashed rounded">
                    桌面已清空
                  </div>
                ) : (
                  state.desk.map((it) => (
                    <DeskItemRow
                      key={it.inbound_id}
                      item={it}
                      onTap={() => doScan(it.tracking_no)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Group: 已集箱 */}
            <div>
              <div className="px-1 mb-1.5 mt-3 text-[11px] uppercase tracking-wide font-mono text-gray-500 flex justify-between">
                <span>
                  已集箱 · <b className="text-gray-900">{boxedRows.length}</b>
                </span>
                <span>tap = 拿起換箱</span>
              </div>
              <div className="space-y-1.5">
                {boxedRows.length === 0 ? (
                  <div className="text-center text-gray-400 text-xs py-3 border border-dashed rounded">
                    尚未有任何貨件入箱
                  </div>
                ) : (
                  boxedRows.map((r) => (
                    <BoxedItemRow
                      key={r.item.inbound_id}
                      item={r.item}
                      boxNo={r.box_no}
                      onTap={() => doScan(r.item.tracking_no)}
                    />
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {view === "boxes" && (
          <div className="space-y-2">
            {/* Complete-session action at top of the boxes tab */}
            <Button
              className="w-full h-11 font-semibold"
              onClick={doCompleteSession}
              disabled={state.open_boxes.length === 0}
            >
              <IconCheck size={16} className="mr-1" />
              完成裝箱 · 轉去複重置板
            </Button>
            {state.open_boxes.length === 0 && (
              <div className="text-center text-gray-500 text-xs py-6">
                未開任何箱
              </div>
            )}
            {state.open_boxes.map((b) => (
              <div
                key={b.box_no}
                className="bg-white border rounded p-3 space-y-2"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono font-bold">
                      {b.box_no}
                      {b.is_single_direct && (
                        <span className="text-amber-700 text-[11px]">
                          {" · 直發"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {b.client_name || b.client_code}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-gray-500">
                    {b.items.length}/{b.max_slots}
                  </div>
                </div>
                <div className="space-y-1">
                  {b.items.map((it) => (
                    <div
                      key={it.inbound_id}
                      className="text-[11px] flex justify-between gap-2"
                    >
                      <span className="font-mono">{it.tracking_no}</span>
                      <span className="text-gray-500 truncate">
                        {it.product_name || "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => doCancelBox(b.box_no)}
                  >
                    撤銷
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={b.items.length === 0}
                    onClick={() => doSeal(b.box_no)}
                  >
                    封箱
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {msg && (
        <div
          className={cn(
            "fixed bottom-20 left-3 right-3 px-3 py-2 rounded text-xs text-white shadow-lg z-50",
            msg.kind === "ok" ? "bg-green-600" : "bg-red-600"
          )}
        >
          {msg.text}
        </div>
      )}

      {/* In-hand modal: item detail + box scan */}
      {inHand && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-xl p-4 space-y-3 max-h-[88vh] overflow-auto">
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  inHand.mode === "swap"
                    ? "border-blue-300 text-blue-800"
                    : "border-red-300 text-red-800"
                )}
              >
                ● {inHand.mode === "swap" ? "換箱中" : "在手中"}
              </Badge>
              <button
                onClick={() => setInHand(null)}
                className="text-gray-400 p-1 -m-1"
                aria-label="close"
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Item card */}
            <div className="bg-gray-50 border rounded p-3 space-y-1.5">
              <div className="font-mono text-sm font-bold">
                {inHand.item.tracking_no}
              </div>
              <div className="text-sm">{inHand.item.product_name || "—"}</div>
              <div className="text-xs text-gray-600">
                <span className="font-mono">{inHand.owner.client_code}</span>{" "}
                · {inHand.owner.client_name} · {inHand.item.outbound_id}
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {inHand.item.shipment_type === "single" && (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-px">
                    直發 · 必須單獨開箱
                  </span>
                )}
                {(() => {
                  const inHandDesk = state.desk.find(
                    (d) => d.inbound_id === inHand.item.inbound_id
                  );
                  const boxedRow = boxedRows.find(
                    (r) => r.item.inbound_id === inHand.item.inbound_id
                  );
                  const battery =
                    inHandDesk?.contains_battery ??
                    boxedRow?.item.contains_battery ??
                    false;
                  const liquid =
                    inHandDesk?.contains_liquid ??
                    boxedRow?.item.contains_liquid ??
                    false;
                  return (
                    <>
                      {battery && (
                        <span className="text-[10px] inline-flex items-center gap-0.5 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-px">
                          <IconBattery size={11} /> 含電
                        </span>
                      )}
                      {liquid && (
                        <span className="text-[10px] inline-flex items-center gap-0.5 text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-px">
                          <IconDroplet size={11} /> 含液體
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              {inHand.from_box && (
                <div className="text-[11px] text-blue-700 pt-1 border-t">
                  原箱 {inHand.from_box.box_no} ·{" "}
                  {inHand.from_box.items.length} →{" "}
                  {inHand.from_box.items.length - 1}/{inHand.from_box.max_slots}
                </div>
              )}
            </div>

            {/* Box scan input — single direct: only "open new box" */}
            {inHand.item.shipment_type === "single" ? (
              <Button className="w-full h-12" onClick={doOpenNewBox}>
                ＋ 開新箱（直發 · 自動列印箱號）
              </Button>
            ) : (
              <>
                <div className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wide font-mono text-gray-500">
                    掃描箱 barcode 入箱
                  </div>
                  <Input
                    ref={modalBoxScanRef}
                    value={modalBoxScan}
                    placeholder="BOX-… (對準箱貼)"
                    onChange={(e) => {
                      setModalBoxScan(e.target.value);
                      if (modalErr) setModalErr("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitModalBoxScan();
                    }}
                  />
                  {modalErr && (
                    <div className="text-[11px] text-red-700">{modalErr}</div>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={doOpenNewBox}
                >
                  ＋ 開新箱（自動列印箱號）
                </Button>

                {/* Optional: list of client's open boxes for fallback tap */}
                {(() => {
                  const ownerBoxes = state.open_boxes.filter(
                    (b) => b.client_id === inHand.owner.client_id
                  );
                  if (ownerBoxes.length === 0) return null;
                  return (
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase tracking-wide font-mono text-gray-500 px-1">
                        或從客戶的箱選 · {ownerBoxes.length}
                      </div>
                      {ownerBoxes.map((b) => {
                        const full = b.items.length >= b.max_slots;
                        const isFrom = b.box_no === inHand.from_box?.box_no;
                        return (
                          <button
                            key={b.box_no}
                            disabled={full || isFrom || b.is_single_direct}
                            onClick={() => doPlace(b)}
                            className={cn(
                              "w-full bg-white border rounded p-2 text-left",
                              (full || isFrom || b.is_single_direct) &&
                                "opacity-40 cursor-not-allowed",
                              isFrom && "border-dashed"
                            )}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-mono font-bold text-sm">
                                {b.box_no}
                                {isFrom && (
                                  <span className="text-blue-600"> · 原箱</span>
                                )}
                                {b.is_single_direct && (
                                  <span className="text-amber-700"> · 直發</span>
                                )}
                              </span>
                              <span
                                className={cn(
                                  "font-mono text-xs",
                                  full ? "text-amber-700" : "text-gray-500"
                                )}
                              >
                                {b.items.length}/{b.max_slots}
                                {full ? " · 滿" : ""}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

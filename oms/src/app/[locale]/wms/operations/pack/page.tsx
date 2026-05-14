"use client";

import PageLayout from "@/components/page-layout";
import { get_request, post_request } from "@/lib/httpRequest";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./packing.css";

// ── Types ─────────────────────────────────────────────────────────────

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
};

type PackBoxItem = {
  inbound_id: string;
  outbound_id: string;
  tracking_no: string;
};

type OpenBox = {
  _id: string;
  box_no: string;
  client_id: string;
  client_code: string;
  client_name?: string;
  is_single_direct: boolean;
  items: PackBoxItem[];
  max_slots: number;
  opened_at: string;
};

type StationState = {
  desk: DeskItem[];
  open_boxes: OpenBox[];
  stats: { desk_count: number; open_box_count: number; packed_item_count: number };
};

type InHand =
  | { mode: "place" | "swap"; item: DeskItem; from_box?: OpenBox }
  | null;

type Toast = { kind: "ok" | "err"; msg: string } | null;

const fmtTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function openPrintPopup(boxNo: string, clientLabel: string, isSingleDirect = false) {
  const qs = new URLSearchParams({
    box_no: boxNo,
    client: clientLabel,
    ...(isSingleDirect ? { variant: "single" } : {}),
  });
  // resolve current locale segment so the popup stays in zh-hk/en etc.
  const loc =
    typeof window !== "undefined"
      ? window.location.pathname.split("/")[1] || "zh-hk"
      : "zh-hk";
  // No `noopener` — the popup needs window-level activation in some browsers
  // for the auto-print() call to be allowed.
  window.open(`/${loc}/wms/print/box-label?${qs.toString()}`, "_blank");
}

async function apiJson<T>(
  method: "GET" | "POST",
  url: string,
  body?: any
): Promise<{ ok: boolean; data?: T; message?: string }> {
  const res = method === "GET" ? await get_request(url, body) : await post_request(url, body);
  const json = await res.json().catch(() => ({}));
  if (res.status !== 200 || json.status !== 200) {
    return { ok: false, message: json.message || `HTTP ${res.status}` };
  }
  return { ok: true, data: json.data as T };
}

function DeskItemRow({ item, isActive, disabled, onScan }: { item: DeskItem; isActive: boolean; disabled: boolean; onScan: (it: DeskItem) => void }) {
  return (
    <div className={"pk-deskitem" + (isActive ? " is-active" : "")}>
      <div className="swatch" style={{ background: "#e8e8e6", fontSize: 9 }}>{item.client_code.slice(0, 3)}</div>
      <div className="meta">
        <div className="l1">{item.tracking_no}</div>
        <div className="l2">{item.product_name || "—"} · {item.client_name}</div>
      </div>
      <button className="scanbtn" onClick={() => onScan(item)} disabled={disabled || isActive}>
        {isActive ? "在手" : "Scan"}
      </button>
    </div>
  );
}

function InHandCard({ inHand, ownerDeskCount, ownerSOs, ownerBoxes, onCancel }: { inHand: NonNullable<InHand>; ownerDeskCount: number; ownerSOs: { outbound_id: string; inbound_count: number }[]; ownerBoxes: OpenBox[]; onCancel: () => void }) {
  const isSwap = inHand.mode === "swap";
  const it = inHand.item;
  return (
    <div className={"pk-hand" + (isSwap ? " is-swap" : "")}>
      <div className="pk-hand-head">
        <div className="pk-hand-photo" style={{ background: "#e8e8e6" }}>IMG</div>
        <div className="pk-hand-title">
          <div className="name">{it.product_name || "—"}</div>
          <div className="code">{it.tracking_no} · {it.client_code}</div>
          <div className="pill-row">
            <span className="anno">{it.client_name}</span>
            <span className="anno">{it.outbound_id}</span>
            {it.shipment_type === "single" && (
              <span className="anno" style={{ background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" }}>直發 · Single</span>
            )}
            {isSwap && inHand.from_box && (
              <span className="anno swap">換箱中 · 原 {inHand.from_box.box_no}</span>
            )}
          </div>
        </div>
        <span className={"lbl-inhand" + (isSwap ? " swap" : "")}>{isSwap ? "換箱中" : "在手中"}</span>
        <button
          onClick={onCancel}
          title={isSwap ? "取消，留回原箱" : "取消，放回桌面"}
          style={{ background: "transparent", border: "1px solid var(--border-strong)", width: 28, height: 28, borderRadius: 4, cursor: "pointer", color: "var(--muted)", fontSize: 14, lineHeight: 1 }}
        >×</button>
      </div>
      <div className="pk-hand-body">
        <div className="pk-hand-cell">
          <div className="k">客戶 · Client</div>
          <div className="v">{it.client_name} <span className="secondary">{it.client_code}</span></div>
        </div>
        <div className="pk-hand-cell">
          <div className="k">客戶桌面剩件</div>
          <div className="v">{ownerDeskCount} 件 <span className="secondary">{isSwap ? "不含此件" : "含此件"}</span></div>
        </div>
        <div className="pk-hand-cell">
          <div className="k">相關出庫單</div>
          <div className="v-list">
            {ownerSOs.map((s) => (
              <div className="row" key={s.outbound_id}>
                <span>{s.outbound_id}</span>
                <span className="r">共 {s.inbound_count} 件</span>
              </div>
            ))}
            {ownerSOs.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>—</div>}
          </div>
        </div>
        <div className="pk-hand-cell">
          <div className="k">已開箱 (客戶)</div>
          <div className="v-list">
            {ownerBoxes.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>未開任何箱 — 下一步須開新箱</div>
            )}
            {ownerBoxes.map((b) => {
              const full = b.items.length >= b.max_slots;
              const isFrom = inHand.from_box?.box_no === b.box_no;
              return (
                <div className="row" key={b.box_no}>
                  <span>
                    {b.box_no}{isFrom ? " · 原箱" : ""}{b.is_single_direct ? " · 直發" : ""}
                  </span>
                  <span className="r">{b.items.length}/{b.max_slots}{full ? " · 滿" : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BoxPicker({ inHand, boxes, onPick, onOpenNew, boxScanText, setBoxScanText, onBoxScanSubmit, boxScanError }: { inHand: NonNullable<InHand>; boxes: OpenBox[]; onPick: (box: OpenBox) => void; onOpenNew: () => void; boxScanText: string; setBoxScanText: (s: string) => void; onBoxScanSubmit: (s: string) => void; boxScanError: string }) {
  const isSwap = inHand.mode === "swap";
  const isSingle = inHand.item.shipment_type === "single";
  return (
    <div className="pk-decide">
      <div className="pk-decide-head">
        <div className="h">{isSingle ? "直發單獨開箱" : isSwap ? "換到哪個箱？" : "放入哪個箱？"}</div>
        <div className="sub">
          {isSingle ? "直發貨不可拼入其他箱 — 按「開新箱」即可列印箱號 barcode" : "掃描箱 barcode · 或從下方點選"}
        </div>
      </div>
      {!isSingle && (
        <>
          <div className="pk-decide-actions">
            <div className={"pk-boxscan" + (boxScanError ? " err" : "")}>
              <span className="ico">⌖</span>
              <input
                type="text"
                placeholder="掃描箱 barcode (例如 BOX-XXX-001) …"
                value={boxScanText}
                onChange={(e) => setBoxScanText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onBoxScanSubmit(boxScanText); }}
                autoFocus
              />
              <span className="kbd">↵</span>
            </div>
            <button className="pk-boxopt-newbtn" onClick={onOpenNew}>
              <span className="plus">＋</span><span>開新箱</span>
            </button>
          </div>
          {boxScanError && <div className="pk-boxscan-err">{boxScanError}</div>}
          <div className="pk-decide-divider"><span>或從列表選</span></div>
        </>
      )}
      {isSingle ? (
        <div style={{ padding: "12px 0" }}>
          <button className="pk-boxopt-newbtn" onClick={onOpenNew} style={{ width: "100%", height: 56, fontSize: 14 }}>
            <span className="plus">＋</span><span>開新箱（直發 · 自動列印箱號）</span>
          </button>
        </div>
      ) : (
        <div className="pk-decide-grid">
          {boxes.length === 0 && (
            <div style={{ gridColumn: "1 / -1", padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
              客戶未開任何箱 — 按「開新箱」開始
            </div>
          )}
          {boxes.map((b) => {
            const full = b.items.length >= b.max_slots;
            const pct = (b.items.length / b.max_slots) * 100;
            const isFrom = inHand.from_box?.box_no === b.box_no;
            return (
              <button
                key={b.box_no}
                className={"pk-boxopt" + (isFrom ? " is-from" : "")}
                disabled={full || isFrom || b.is_single_direct}
                onClick={() => onPick(b)}
                title={isFrom ? "已在此箱內" : b.is_single_direct ? "直發箱不可拼入" : undefined}
              >
                <div className="top">
                  <div className="code">
                    {b.box_no}
                    {isFrom && <span className="from-tag"> · 原箱</span>}
                    {b.is_single_direct && <span className="from-tag"> · 直發</span>}
                  </div>
                  <div className={"fill" + (full ? " full" : "")}>{b.items.length}/{b.max_slots}{full ? " · 滿" : ""}</div>
                </div>
                <div className="bar"><div className={full ? "full" : ""} style={{ width: pct + "%" }} /></div>
                <div className="preview">
                  {b.items.slice(0, 6).map((it) => (
                    <span className="chip" key={it.inbound_id}>{it.tracking_no.slice(-4)}</span>
                  ))}
                  {b.items.length > 6 && <span className="chip">+{b.items.length - 6}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfirmPlaceModal({ inHand, box, onConfirm, onCancel }: { inHand: NonNullable<InHand>; box: OpenBox; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter") onConfirm();
      else if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel]);

  const isSwap = inHand.mode === "swap";
  const pct = (box.items.length / box.max_slots) * 100;

  return (
    <div className="pk-modal-backdrop" onMouseDown={onCancel}>
      <div className="pk-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pk-modal-head">
          <div className="t">{isSwap ? "確認換箱" : "確認入箱"}</div>
          <div className="s">
            {isSwap
              ? `由 ${inHand.from_box?.box_no} 搬到 ${box.box_no} — Enter 確認、Esc 取消`
              : "掃描命中 — 按 Enter 確認、Esc 取消"}
          </div>
        </div>
        <div className="pk-modal-body">
          <div className="pk-modal-row">
            <div className="pk-modal-side">
              <div className="lbl">{isSwap ? "原箱" : "在手中"}</div>
              {isSwap && inHand.from_box ? (
                <div className="pk-modal-boxcard">
                  <div className="boxhead">
                    <span className="clientchip">{inHand.item.client_code}</span>
                    <span className="code">{inHand.from_box.box_no}</span>
                  </div>
                  <div className="fillrow">
                    <div className="bar"><div style={{ width: ((inHand.from_box.items.length / inHand.from_box.max_slots) * 100) + "%" }} /></div>
                    <div className="fillnum">
                      {inHand.from_box.items.length} → <b>{inHand.from_box.items.length - 1}</b>/{inHand.from_box.max_slots}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pk-modal-itemcard">
                  <div className="ph" style={{ background: "#e8e8e6" }}>IMG</div>
                  <div className="meta">
                    <div className="name">{inHand.item.product_name || "—"}</div>
                    <div className="code">{inHand.item.tracking_no}</div>
                    <div className="client">{inHand.item.client_name} · {inHand.item.outbound_id}</div>
                  </div>
                </div>
              )}
            </div>
            <div className="pk-modal-arrow">→</div>
            <div className="pk-modal-side">
              <div className="lbl">{isSwap ? "搬入" : "入此箱"}</div>
              <div className="pk-modal-boxcard">
                <div className="boxhead">
                  <span className="clientchip">{inHand.item.client_code}</span>
                  <span className="code">{box.box_no}</span>
                </div>
                <div className="fillrow">
                  <div className="bar"><div style={{ width: pct + "%" }} /></div>
                  <div className="fillnum">
                    {box.items.length} → <b>{box.items.length + 1}</b>/{box.max_slots}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="pk-modal-foot">
          <button onClick={onCancel} className="btn">取消 · Esc</button>
          <button onClick={onConfirm} className="btn primary">
            {isSwap ? "確認換箱 · ↵" : "確認入箱 · ↵"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BoxCard({ box, reorgMode, isTarget, dropState, swapSourceId, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, onScanPackedItem, onCancelBox, onSeal }: { box: OpenBox; reorgMode: boolean; isTarget: boolean; dropState: "valid" | "invalid" | null; swapSourceId: string | null; onDragStart: (e: React.DragEvent, fromBoxNo: string, inboundId: string) => void; onDragEnd: () => void; onDragOver: (e: React.DragEvent, boxNo: string) => void; onDragLeave: (boxNo: string) => void; onDrop: (e: React.DragEvent, toBoxNo: string) => void; onScanPackedItem: (boxNo: string, inboundId: string) => void; onCancelBox: (boxNo: string) => void; onSeal: (boxNo: string) => void }) {
  const full = box.items.length >= box.max_slots;
  return (
    <div
      className={"pk-box" + (isTarget ? " is-target" : "") + (dropState === "valid" ? " is-drop-target" : "") + (dropState === "invalid" ? " is-drop-invalid" : "")}
      onDragOver={reorgMode ? (e) => onDragOver(e, box.box_no) : undefined}
      onDragLeave={reorgMode ? () => onDragLeave(box.box_no) : undefined}
      onDrop={reorgMode ? (e) => onDrop(e, box.box_no) : undefined}
    >
      <div className="pk-box-head">
        <div className="l">
          <span className="clientchip">{box.client_code}</span>
          <span className="code">{box.box_no}</span>
          {box.is_single_direct && (
            <span className="anno" style={{ background: "#fef3c7", color: "#92400e", borderColor: "#fde68a", fontSize: 9 }}>直發</span>
          )}
        </div>
        <div className="pk-box-head-r">
          <div className={"fill" + (full ? " full" : "")}>
            {box.items.length}/{box.max_slots}{full ? " · 滿" : ""}
          </div>
          {!reorgMode && (
            <button className="pk-box-x" title="撤銷此箱 · 所有貨件返回桌面" onClick={() => onCancelBox(box.box_no)}>×</button>
          )}
        </div>
      </div>
      <div className="pk-box-body">
        <div className="pk-box-items">
          {box.items.length === 0 && (
            <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>空箱 · 等待第一件貨</span>
          )}
          {box.items.map((it) => {
            const label = it.tracking_no.slice(-4) + "·" + it.inbound_id.slice(-2);
            const isSwapSource = swapSourceId === it.inbound_id;
            return (
              <span
                key={it.inbound_id}
                className={"pk-itemchip" + (reorgMode ? " draggable" : " clickable") + (isSwapSource ? " is-swap-source" : "")}
                draggable={reorgMode}
                onDragStart={reorgMode ? (e) => onDragStart(e, box.box_no, it.inbound_id) : undefined}
                onDragEnd={reorgMode ? onDragEnd : undefined}
                onClick={!reorgMode ? () => onScanPackedItem(box.box_no, it.inbound_id) : undefined}
                title={reorgMode ? `${it.tracking_no} · ${it.outbound_id}` : `${it.tracking_no} — 點擊 = 取出換箱`}
              >{label}</span>
            );
          })}
        </div>
      </div>
      <div className="pk-box-foot">
        <span className="opened">{box.client_name || box.client_code} · 開箱 {fmtTime(box.opened_at)}</span>
        <button className="seal" disabled={box.items.length === 0 || reorgMode} onClick={() => onSeal(box.box_no)}>封箱</button>
      </div>
    </div>
  );
}

function PackingStation() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params?.locale || "zh-hk";
  const [state, setState] = useState<StationState>({
    desk: [], open_boxes: [], stats: { desk_count: 0, open_box_count: 0, packed_item_count: 0 },
  });
  const [inHand, setInHand] = useState<InHand>(null);
  const [filterClient, setFilterClient] = useState<string | null>(null);
  const [reorgMode, setReorgMode] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [scanText, setScanText] = useState("");
  const [boxScanText, setBoxScanText] = useState("");
  const [boxScanError, setBoxScanError] = useState("");
  const [confirmBoxNo, setConfirmBoxNo] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ fromBoxNo: string; inboundId: string } | null>(null);
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [lastBoxNo, setLastBoxNo] = useState<string | null>(null);

  const toastTimer = useRef<any>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    const r = await apiJson<StationState>("GET", "/api/wms/outbound/pack/state");
    if (r.ok && r.data) setState(r.data);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const showToast = useCallback((kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const ownerOpenBoxes = useMemo(() => {
    if (!inHand) return [] as OpenBox[];
    return state.open_boxes.filter((b) => b.client_id === inHand.item.client_id);
  }, [inHand, state.open_boxes]);

  const ownerDeskCount = useMemo(() => {
    if (!inHand) return 0;
    return state.desk.filter((d) => d.client_id === inHand.item.client_id).length;
  }, [inHand, state.desk]);

  const ownerSOs = useMemo(() => {
    if (!inHand) return [] as { outbound_id: string; inbound_count: number }[];
    const seen = new Set<string>();
    const out: { outbound_id: string; inbound_count: number }[] = [];
    for (const d of state.desk) {
      if (d.client_id !== inHand.item.client_id) continue;
      if (seen.has(d.outbound_id)) continue;
      seen.add(d.outbound_id);
      out.push({
        outbound_id: d.outbound_id,
        inbound_count: state.desk.filter((x) => x.outbound_id === d.outbound_id).length,
      });
    }
    for (const b of ownerOpenBoxes) {
      for (const it of b.items) {
        if (!seen.has(it.outbound_id)) {
          seen.add(it.outbound_id);
          out.push({ outbound_id: it.outbound_id, inbound_count: 0 });
        }
      }
    }
    return out;
  }, [inHand, state.desk, ownerOpenBoxes]);

  const deskClients = useMemo(() => {
    const m = new Map<string, { id: string; code: string; name: string }>();
    for (const d of state.desk) {
      if (!m.has(d.client_id)) m.set(d.client_id, { id: d.client_id, code: d.client_code, name: d.client_name });
    }
    return Array.from(m.values());
  }, [state.desk]);

  const visibleDesk = useMemo(
    () => (filterClient ? state.desk.filter((d) => d.client_id === filterClient) : state.desk),
    [state.desk, filterClient]
  );

  async function performScan(scanCode: string) {
    const r = await apiJson<{ mode: "place" | "swap"; item: any; owner: any; from_box?: OpenBox }>(
      "POST",
      "/api/wms/outbound/pack/scan",
      { scanCode }
    );
    if (!r.ok || !r.data) {
      showToast("err", r.message || `掃描失敗：${scanCode}`);
      setScanText("");
      return;
    }
    const d = r.data;
    setInHand({
      mode: d.mode,
      from_box: d.from_box,
      item: {
        inbound_id: d.item.inbound_id,
        outbound_id: d.item.outbound_id,
        client_id: d.owner.client_id,
        client_code: d.owner.client_code,
        client_name: d.owner.client_name,
        tracking_no: d.item.tracking_no,
        product_name: d.item.product_name,
        shipment_type: d.item.shipment_type,
        declared_items_count: 1,
      },
    });
    setScanText("");
    setBoxScanText("");
    setBoxScanError("");
    setConfirmBoxNo(null);
    setLastBoxNo(null);
  }

  function scanItem(it: DeskItem) {
    if (reorgMode) return;
    setInHand({ mode: "place", item: it });
    setScanText("");
    setBoxScanText("");
    setBoxScanError("");
    setConfirmBoxNo(null);
    setLastBoxNo(null);
  }

  async function scanPackedItem(boxNo: string, inboundId: string) {
    if (reorgMode) return;
    const box = state.open_boxes.find((b) => b.box_no === boxNo);
    if (!box) return;
    const it = box.items.find((i) => i.inbound_id === inboundId);
    if (!it) return;
    await performScan(it.tracking_no);
    showToast("ok", `已取出 ${it.tracking_no} · 換箱中`);
  }

  function cancelInHand() {
    setInHand(null); setBoxScanText(""); setBoxScanError(""); setConfirmBoxNo(null);
  }

  async function openNewBox() {
    if (!inHand) return;
    const r = await apiJson<{ box: OpenBox; printPayload: any }>("POST", "/api/wms/outbound/pack/open-box", {
      inbound_id: inHand.item.inbound_id,
      outbound_id: inHand.item.outbound_id,
      from_box_no: inHand.from_box?.box_no || null,
    });
    if (!r.ok || !r.data) {
      showToast("err", r.message || "開新箱失敗"); return;
    }
    const newBoxNo = r.data.box.box_no;
    const isSingle = inHand.item.shipment_type === "single";
    openPrintPopup(newBoxNo, inHand.item.client_name, isSingle);
    showToast("ok", `已開新箱 ${newBoxNo} · 自動列印中`);
    setLastBoxNo(newBoxNo);
    setInHand(null); setBoxScanText(""); setBoxScanError(""); setConfirmBoxNo(null);
    await refresh();
  }

  async function placeInBox(box: OpenBox) {
    if (!inHand) return;
    const r = await apiJson("POST", "/api/wms/outbound/pack/place", {
      inbound_id: inHand.item.inbound_id,
      outbound_id: inHand.item.outbound_id,
      to_box_no: box.box_no,
      from_box_no: inHand.from_box?.box_no || null,
    });
    if (!r.ok) { showToast("err", r.message || "放入失敗"); return; }
    showToast(
      "ok",
      inHand.from_box
        ? `${inHand.item.tracking_no} : ${inHand.from_box.box_no} → ${box.box_no}`
        : `${inHand.item.tracking_no} → ${box.box_no}`
    );
    setLastBoxNo(box.box_no);
    setInHand(null); setConfirmBoxNo(null); setBoxScanText(""); setBoxScanError("");
    await refresh();
  }

  function trySubmitBoxScan(text: string) {
    if (!inHand) return;
    const t2 = (text || "").trim().toUpperCase();
    if (!t2) return;
    const match = state.open_boxes.find((b) => b.box_no.toUpperCase() === t2);
    if (!match) { setBoxScanError(`找不到「${text}」這個箱`); return; }
    if (match.client_id !== inHand.item.client_id) { setBoxScanError(`${match.box_no} 屬於其他客戶，不可放入此貨件`); return; }
    if (match.box_no === inHand.from_box?.box_no) { setBoxScanError(`${match.box_no} 是原箱，不需要換`); return; }
    if (match.items.length >= match.max_slots) { setBoxScanError(`${match.box_no} 已滿`); return; }
    if (match.is_single_direct) { setBoxScanError(`${match.box_no} 是直發箱，不可拼入`); return; }
    setBoxScanError("");
    setConfirmBoxNo(match.box_no);
  }

  async function cancelBox(boxNo: string) {
    if (!confirm(`確定撤銷 ${boxNo}？箱內所有件會退回桌面。`)) return;
    const r = await apiJson("POST", "/api/wms/outbound/pack/cancel-box", { box_no: boxNo });
    if (!r.ok) { showToast("err", r.message || "撤銷失敗"); return; }
    showToast("ok", `${boxNo} 已撤銷`);
    if (inHand?.from_box?.box_no === boxNo) cancelInHand();
    await refresh();
  }

  async function sealBox(boxNo: string) {
    const r = await apiJson("POST", "/api/wms/outbound/pack/seal-box", { box_no: boxNo });
    if (!r.ok) { showToast("err", r.message || "封箱失敗"); return; }
    showToast("ok", `${boxNo} 已封箱`);
    await refresh();
  }

  async function completeSession() {
    if (state.open_boxes.length === 0) {
      showToast("err", "未開任何箱 — 無需完成裝箱");
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
      showToast("err", r.message || "完成裝箱失敗");
      return;
    }
    showToast(
      "ok",
      `已封箱 ${r.data.sealed.length} 個 · ` +
        (r.data.cancelled.length > 0
          ? `撤銷 ${r.data.cancelled.length} 個空箱 · `
          : "") +
        `準備轉去複重置板…`
    );
    await refresh();
    // Give the toast a moment to be seen, then navigate.
    setTimeout(() => {
      router.push(`/${locale}/wms/operations/weigh`);
    }, 1400);
  }

  function dragStart(e: React.DragEvent, fromBoxNo: string, inboundId: string) {
    setDragState({ fromBoxNo, inboundId });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", inboundId);
  }
  function dragEnd() { setDragState(null); setDropHover(null); }
  function dragOver(e: React.DragEvent, boxNo: string) {
    if (!dragState) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropHover(boxNo);
  }
  function dragLeave(boxNo: string) { setDropHover((prev) => (prev === boxNo ? null : prev)); }
  async function dropFn(e: React.DragEvent, toBoxNo: string) {
    e.preventDefault();
    if (!dragState) return;
    const fromBox = state.open_boxes.find((b) => b.box_no === dragState.fromBoxNo);
    const toBox = state.open_boxes.find((b) => b.box_no === toBoxNo);
    if (!fromBox || !toBox) { dragEnd(); return; }
    if (fromBox.box_no === toBox.box_no) { dragEnd(); return; }
    if (fromBox.client_id !== toBox.client_id) {
      showToast("err", "不可搬到其他客戶的箱"); dragEnd(); return;
    }
    if (toBox.items.length >= toBox.max_slots) {
      showToast("err", `${toBox.box_no} 已滿`); dragEnd(); return;
    }
    if (toBox.is_single_direct) {
      showToast("err", `${toBox.box_no} 是直發箱，不可拼入`); dragEnd(); return;
    }
    const item = fromBox.items.find((i) => i.inbound_id === dragState.inboundId);
    if (!item) { dragEnd(); return; }
    const r = await apiJson("POST", "/api/wms/outbound/pack/place", {
      inbound_id: item.inbound_id,
      outbound_id: item.outbound_id,
      to_box_no: toBox.box_no,
      from_box_no: fromBox.box_no,
    });
    if (!r.ok) showToast("err", r.message || "搬箱失敗");
    else {
      showToast("ok", `${item.tracking_no} : ${fromBox.box_no} → ${toBox.box_no}`);
      await refresh();
    }
    dragEnd();
  }

  return (
    <div className="pk" style={{ height: "calc(100vh - 200px)", minHeight: 600 }}>
      <div className="pk-top">
        <div className="pk-top-l">
          <div className="station"><span className="dot"></span>集包工作站</div>
          <span className="packer">item-driven dispatch</span>
        </div>
        <div className="pk-top-r">
          <div className="stat"><b>{state.stats.packed_item_count}</b>件已入箱</div>
          <div className="stat"><b>{state.open_boxes.length}</b>個進行中</div>
          <div className="stat"><b>{state.desk.length}</b>件在桌面</div>
          <button
            onClick={refresh}
            style={{ marginLeft: 12, padding: "4px 10px", border: "1px solid var(--border-strong)", background: "var(--surface)", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
          >↻ Refresh</button>
          <button
            onClick={completeSession}
            disabled={state.open_boxes.length === 0}
            style={{
              marginLeft: 8,
              padding: "6px 14px",
              border: "1px solid var(--ink)",
              background: state.open_boxes.length === 0 ? "var(--surface-2)" : "var(--ink)",
              color: state.open_boxes.length === 0 ? "var(--muted-2)" : "var(--accent-ink)",
              borderRadius: 4,
              cursor: state.open_boxes.length === 0 ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
            title="封晒所有開緊的箱 · 轉去複重置板"
          >✓ 完成裝箱</button>
        </div>
      </div>

      <div className="pk-body" style={{ flex: 1, display: "grid", overflow: "hidden" }}>
        <div className="pk-col left">
          <div className="pk-col-head">
            <div className="label">桌面 · <b>{visibleDesk.length}</b> 件</div>
            <div className="count">{deskClients.length}個客戶</div>
          </div>
          <div className="pk-filter">
            <span className={"pkchip" + (filterClient === null ? " on" : "")} onClick={() => setFilterClient(null)}>全部</span>
            {deskClients.map((c) => (
              <span key={c.id} className={"pkchip" + (filterClient === c.id ? " on" : "")} onClick={() => setFilterClient(c.id)}>
                {c.code}
              </span>
            ))}
          </div>
          <div className="pk-col-scroll">
            {visibleDesk.length === 0 && (
              <div style={{ padding: 24, color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
                桌面已清空 · 等下一車貨
              </div>
            )}
            {visibleDesk.map((it) => (
              <DeskItemRow
                key={it.inbound_id}
                item={it}
                isActive={!!inHand && inHand.item.inbound_id === it.inbound_id}
                disabled={reorgMode}
                onScan={scanItem}
              />
            ))}
          </div>
        </div>

        <div className="pk-col mid">
          <div className="pk-scanbar">
            <div className="ico">⌖</div>
            <input
              ref={scanInputRef}
              type="text"
              placeholder={reorgMode ? "重組模式中，無法掃描" : "掃描 barcode 或輸入 tracking no…"}
              value={scanText}
              onChange={(e) => setScanText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") performScan(scanText); }}
              disabled={reorgMode}
            />
            <span className="kbd">↵ Enter</span>
          </div>
          <div className="pk-mid-body">
            {!inHand && !reorgMode && (
              <div className="pk-idle">
                <div className="ring">⌖</div>
                <div className="ttl">等待掃描下一件</div>
                <div className="sub">
                  拿起手邊的貨件 → 掃描 barcode → 桌面會顯示客戶資訊，
                  再由你決定放入哪個箱。
                </div>
              </div>
            )}
            {!inHand && reorgMode && (
              <div className="pk-idle">
                <div className="ring" style={{ borderColor: "#f59e0b", color: "#f59e0b" }}>↹</div>
                <div className="ttl" style={{ color: "#92400e" }}>重組模式</div>
                <div className="sub">
                  從右邊的箱拖拽 chip 到同一客戶的另一個箱。完成後按右上「退出重組」。
                </div>
              </div>
            )}
            {inHand && (
              <>
                <InHandCard
                  inHand={inHand}
                  ownerDeskCount={ownerDeskCount}
                  ownerSOs={ownerSOs}
                  ownerBoxes={ownerOpenBoxes}
                  onCancel={cancelInHand}
                />
                <BoxPicker
                  inHand={inHand}
                  boxes={ownerOpenBoxes}
                  onPick={(b) => placeInBox(b)}
                  onOpenNew={openNewBox}
                  boxScanText={boxScanText}
                  setBoxScanText={(v) => {
                    setBoxScanText(v);
                    if (boxScanError) setBoxScanError("");
                  }}
                  onBoxScanSubmit={trySubmitBoxScan}
                  boxScanError={boxScanError}
                />
              </>
            )}
          </div>
        </div>

        <div className={"pk-col right" + (reorgMode ? " is-reorg" : "")}>
          <div className="pk-col-head">
            <div className="label">進行中的箱 · <b>{state.open_boxes.length}</b></div>
            <button
              className={"pk-reorg-toggle" + (reorgMode ? " on" : "")}
              onClick={() => { setReorgMode((m) => !m); setInHand(null); }}
            >
              {reorgMode ? "退出重組" : "↹ 重組模式"}
            </button>
          </div>
          {reorgMode && (
            <div className="pk-reorg-banner">
              <b>重組模式</b>：拖拽任何一件 chip 到另一個<b>同一客戶</b>的箱。
              滿箱 / 跨客戶 / 直發 會被拒絕。
            </div>
          )}
          <div className="pk-col-scroll">
            {state.open_boxes.length === 0 && (
              <div style={{ padding: 24, color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
                未開任何箱
              </div>
            )}
            {state.open_boxes.map((b) => {
              let dropState: "valid" | "invalid" | null = null;
              if (reorgMode && dragState && dropHover === b.box_no) {
                const fromBox = state.open_boxes.find((x) => x.box_no === dragState.fromBoxNo);
                const valid =
                  !!fromBox &&
                  fromBox.box_no !== b.box_no &&
                  fromBox.client_id === b.client_id &&
                  !b.is_single_direct &&
                  b.items.length < b.max_slots;
                dropState = valid ? "valid" : "invalid";
              }
              return (
                <BoxCard
                  key={b.box_no}
                  box={b}
                  reorgMode={reorgMode}
                  isTarget={lastBoxNo === b.box_no}
                  dropState={dropState}
                  swapSourceId={inHand && inHand.from_box?.box_no === b.box_no ? inHand.item.inbound_id : null}
                  onDragStart={dragStart}
                  onDragEnd={dragEnd}
                  onDragOver={dragOver}
                  onDragLeave={dragLeave}
                  onDrop={dropFn}
                  onScanPackedItem={scanPackedItem}
                  onCancelBox={cancelBox}
                  onSeal={sealBox}
                />
              );
            })}
          </div>
        </div>
      </div>

      {confirmBoxNo && inHand && (
        <ConfirmPlaceModal
          inHand={inHand}
          box={state.open_boxes.find((b) => b.box_no === confirmBoxNo)!}
          onConfirm={() => {
            const b = state.open_boxes.find((x) => x.box_no === confirmBoxNo);
            if (b) placeInBox(b);
          }}
          onCancel={() => setConfirmBoxNo(null)}
        />
      )}

      {toast && (
        <div className={"pk-toast" + (toast.kind === "ok" ? " ok" : "")}>
          <span>{toast.kind === "ok" ? "✓" : "!"}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <PageLayout
      title="wms_ops.pack.page_title"
      description="wms_ops.pack.page_subtitle"
      path={[{ name: "wms_ops.pack.page_title", href: "#" }]}
    >
      <PackingStation />
    </PageLayout>
  );
}

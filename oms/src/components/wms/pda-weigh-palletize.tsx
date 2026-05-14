"use client";

// PDA 秤重置板 — 2-tab mobile UI.
// 秤重 tab: scrolling box list, tap → bottom sheet with L/W/H/weight inputs.
// 置板 tab: scan input + progress + same-client hint + complete button.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { get_request, post_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import {
  IconCheck,
  IconRefresh,
  IconScale,
  IconScan,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── Types (mirror server payload) ────────────────────────────

type WeighBox = {
  box_no: string;
  weighed: boolean;
  length: number;
  width: number;
  height: number;
  weight: number;
  sum_actual_weight_kg: number;
  expected_weight_kg: number;
  tare_kg: number;
  tolerance_kg: number;
};

type WeighEntry = {
  outbound_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  shipment_type: "single" | "consolidated";
  outbound_status: string;
  boxes: WeighBox[];
};

type PalletizeBox = {
  box_no: string;
  length: number;
  width: number;
  height: number;
  weight: number;
};

type PalletizeEntry = {
  outbound_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  shipment_type: "single" | "consolidated";
  outbound_status: string;
  box_count: number;
  total_weight_kg: number;
  boxes: PalletizeBox[];
};

type SameClientHint = { outbound_id: string; status: string };

type ActiveSession = {
  outbound_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  locked_by: string;
  locked_at: string;
  scanned_box_nos: string[];
  remaining_box_nos: string[];
  total: number;
  complete_ready: boolean;
  same_client_hint: SameClientHint[];
};

type State = {
  weigh_queue: WeighEntry[];
  palletize_queue: PalletizeEntry[];
  active_session: ActiveSession | null;
};

const EMPTY: State = {
  weigh_queue: [],
  palletize_queue: [],
  active_session: null,
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

// ── Main ────────────────────────────────────────────────────

export function PdaWeighPalletize() {
  const [state, setState] = useState<State>(EMPTY);
  const [tab, setTab] = useState<"weigh" | "palletize">("weigh");
  const [tabAutoChosen, setTabAutoChosen] = useState(false);
  const [editing, setEditing] = useState<{
    entry: WeighEntry;
    box: WeighBox;
  } | null>(null);
  const [form, setForm] = useState({
    length: "",
    width: "",
    height: "",
    weight: "",
  });
  const [scan, setScan] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const msgTimer = useRef<any>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const weightInputRef = useRef<HTMLInputElement | null>(null);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 2600);
  }, []);

  const refresh = useCallback(async () => {
    const r = await apiJson<State>("GET", "/api/wms/outbound/weigh-palletize/state");
    if (r.ok && r.data) setState(r.data);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (tabAutoChosen) return;
    if (state.weigh_queue.length === 0 && state.palletize_queue.length > 0) {
      setTab("palletize");
    }
    setTabAutoChosen(true);
  }, [state, tabAutoChosen]);

  useEffect(() => {
    if (tab === "palletize") {
      setTimeout(() => scanInputRef.current?.focus(), 80);
    }
  }, [tab, state.active_session?.outbound_id]);

  const totalWeighPending = useMemo(
    () =>
      state.weigh_queue.reduce(
        (s, e) => s + e.boxes.filter((b) => !b.weighed).length,
        0
      ),
    [state.weigh_queue]
  );

  function openEdit(entry: WeighEntry, box: WeighBox) {
    setEditing({ entry, box });
    setForm({
      length: box.length ? String(box.length) : "",
      width: box.width ? String(box.width) : "",
      height: box.height ? String(box.height) : "",
      weight: box.weight ? String(box.weight) : "",
    });
    setTimeout(() => weightInputRef.current?.focus(), 80);
  }

  async function saveBox(force = false) {
    if (!editing) return;
    const length = Number(form.length);
    const width = Number(form.width);
    const height = Number(form.height);
    const weight = Number(form.weight);
    if (!(length > 0 && width > 0 && height > 0 && weight > 0)) {
      flash("err", "請填寫長 / 闊 / 高 / 重量");
      return;
    }
    const r = await apiJson("POST", "/api/wms/outbound/weigh-palletize/save-box", {
      box_no: editing.box.box_no,
      length,
      width,
      height,
      weight,
      force,
    });
    if (!r.ok) {
      const isWeightDiff =
        typeof r.message === "string" &&
        (r.message.includes("容差") || r.message.includes("tolerance"));
      if (isWeightDiff && !force) {
        const b = editing.box;
        const expected = b.expected_weight_kg.toFixed(2);
        const tol = b.tolerance_kg.toFixed(2);
        const diff = Math.abs(weight - b.expected_weight_kg).toFixed(2);
        const ok = window.confirm(
          `⚠ 重量差超出容差\n\n` +
            `預期：${expected} kg（上架 ${b.sum_actual_weight_kg.toFixed(
              2
            )} + 皮重 ${b.tare_kg.toFixed(2)}）\n` +
            `實秤：${weight.toFixed(2)} kg\n` +
            `差距：${diff} kg（容差 ${tol} kg）\n\n` +
            `建議再三檢查箱內貨件及秤重。\n是否仍然儲存？`
        );
        if (!ok) return;
        return saveBox(true);
      }
      flash("err", r.message || "儲存失敗");
      return;
    }
    flash("ok", `${editing.box.box_no} 已儲存`);
    setEditing(null);
    await refresh();
  }

  async function submitScan(codeOverride?: string) {
    const code = (codeOverride ?? scan).trim();
    if (!code) return;
    const r = await apiJson("POST", "/api/wms/outbound/weigh-palletize/scan-box", {
      box_no: code,
    });
    setScan("");
    if (!r.ok) {
      flash("err", r.message || `掃描失敗：${code}`);
      return;
    }
    flash("ok", `${code} 已掃`);
    await refresh();
    setTimeout(() => scanInputRef.current?.focus(), 80);
  }

  async function completePalletize() {
    if (!state.active_session) return;
    const oid = state.active_session.outbound_id;
    if (!confirm(`完成置板 ${oid}？`)) return;
    const r = await apiJson("POST", "/api/wms/outbound/weigh-palletize/complete", {
      outbound_id: oid,
    });
    if (!r.ok) {
      flash("err", r.message || "完成置板失敗");
      return;
    }
    flash("ok", `${oid} 已完成置板`);
    await refresh();
  }

  async function cancelSession() {
    if (!state.active_session) return;
    if (!confirm("暫停此置板？已掃描的記錄會保留。")) return;
    const r = await apiJson(
      "POST",
      "/api/wms/outbound/weigh-palletize/cancel-session"
    );
    if (!r.ok) {
      flash("err", r.message || "暫停失敗");
      return;
    }
    flash("ok", "已暫停置板");
    await refresh();
  }

  const session = state.active_session;

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip */}
      <div className="flex border-b bg-white sticky top-0 z-10">
        <button
          onClick={() => setTab("weigh")}
          className={cn(
            "flex-1 py-3 text-sm font-medium border-b-2",
            tab === "weigh"
              ? "border-black text-black"
              : "border-transparent text-gray-500"
          )}
        >
          <IconScale size={16} className="inline mr-1 -mt-0.5" />
          秤重 ({totalWeighPending})
        </button>
        <button
          onClick={() => setTab("palletize")}
          className={cn(
            "flex-1 py-3 text-sm font-medium border-b-2",
            tab === "palletize"
              ? "border-black text-black"
              : "border-transparent text-gray-500"
          )}
        >
          <IconScan size={16} className="inline mr-1 -mt-0.5" />
          置板 ({state.palletize_queue.length})
          {session && (
            <span className="ml-1 text-[9px] bg-blue-100 text-blue-800 px-1 py-px rounded">
              ●
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3 space-y-3 pb-24">
        {tab === "weigh" && (
          <>
            <div className="flex justify-between items-center">
              <div className="text-[11px] uppercase tracking-wide font-mono text-gray-500">
                待秤重 · {totalWeighPending} 箱
              </div>
              <Button variant="outline" size="sm" onClick={refresh}>
                <IconRefresh size={12} />
              </Button>
            </div>

            {state.weigh_queue.length === 0 && (
              <div className="text-center text-gray-400 text-xs py-6 border border-dashed rounded">
                暫無待秤重的箱
              </div>
            )}

            {state.weigh_queue.map((e) => (
              <div key={e.outbound_id} className="bg-white border rounded p-2 space-y-1.5">
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-xs">
                      {e.outbound_id}
                    </div>
                    <div className="text-[11px] text-gray-600 truncate">
                      {e.client_name}{" "}
                      <span className="text-gray-400">· {e.client_code}</span>
                    </div>
                  </div>
                  <div className="text-[10px] font-mono">
                    <span className="bg-gray-100 px-1 py-px rounded">
                      {e.outbound_status}
                    </span>
                    {e.shipment_type === "single" && (
                      <span className="ml-1 bg-amber-100 text-amber-800 border border-amber-200 rounded px-1 py-px">
                        直發
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  {e.boxes.map((b) => (
                    <button
                      key={b.box_no}
                      disabled={b.weighed}
                      onClick={() => openEdit(e, b)}
                      className={cn(
                        "w-full text-left p-2 rounded border text-xs flex justify-between items-center",
                        b.weighed
                          ? "bg-gray-50 border-gray-200 text-gray-400"
                          : "bg-white border-gray-300 active:bg-gray-100"
                      )}
                    >
                      <span className="font-mono font-bold">{b.box_no}</span>
                      {b.weighed ? (
                        <span className="text-green-600 text-[10px]">
                          <IconCheck size={11} className="inline" />{" "}
                          {b.length}·{b.width}·{b.height}cm · {b.weight}kg
                        </span>
                      ) : (
                        <span className="text-amber-600 text-[10px]">未秤 →</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "palletize" && (
          <>
            <div
              className={cn(
                "border rounded p-3 space-y-2",
                session ? "bg-blue-50 border-blue-300" : "bg-white"
              )}
            >
              {session ? (
                <>
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase font-mono text-gray-500">
                        進行中
                      </div>
                      <div className="font-mono font-bold text-sm">
                        {session.outbound_id}
                      </div>
                      <div className="text-[11px] text-gray-700 truncate">
                        {session.client_name}{" "}
                        <span className="text-gray-400">
                          · {session.client_code}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold">
                        {session.scanned_box_nos.length}/{session.total}
                      </div>
                      <div className="text-[9px] text-gray-500">進度</div>
                    </div>
                  </div>
                  {session.same_client_hint.length > 0 && (
                    <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5">
                      賣家 <b>{session.client_name}</b> 還有{" "}
                      <b>{session.same_client_hint.length}</b> 張未離站 ·
                      建議放在一起：
                      {session.same_client_hint
                        .map((h) => `${h.outbound_id} [${h.status}]`)
                        .join(" · ")}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[11px] text-gray-600">
                  掃描任何待置板的箱以開始 — 系統會自動鎖定該出庫單
                </div>
              )}
              <Input
                ref={scanInputRef}
                autoFocus
                value={scan}
                placeholder="BOX-…"
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitScan();
                }}
                className="font-mono"
              />
              <Button
                className="w-full"
                onClick={() => submitScan()}
                disabled={!scan.trim()}
              >
                <IconScan size={14} className="mr-1" />
                掃描
              </Button>
              {session && session.remaining_box_nos.length > 0 && (
                <div className="text-[10px] text-gray-700">
                  待掃：
                  {session.remaining_box_nos.map((bn) => (
                    <span
                      key={bn}
                      className="inline-block ml-1 font-mono bg-white border rounded px-1 py-px"
                    >
                      {bn}
                    </span>
                  ))}
                </div>
              )}
              {session && (
                <div className="flex gap-2 pt-1">
                  <Button
                    className="flex-1"
                    onClick={completePalletize}
                    disabled={!session.complete_ready}
                  >
                    <IconCheck size={14} className="mr-1" />
                    完成置板
                  </Button>
                  <Button variant="outline" onClick={cancelSession}>
                    暫停
                  </Button>
                </div>
              )}
            </div>

            <div className="text-[11px] uppercase tracking-wide font-mono text-gray-500 mt-3 mb-1">
              待置板隊列 · {state.palletize_queue.length}
            </div>
            {state.palletize_queue.length === 0 && !session && (
              <div className="text-center text-gray-400 text-xs py-6 border border-dashed rounded">
                暫無待置板的出庫單
              </div>
            )}
            <div className="space-y-1.5">
              {state.palletize_queue.map((e) => (
                <div key={e.outbound_id} className="bg-white border rounded p-2">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-xs">
                        {e.outbound_id}
                      </div>
                      <div className="text-[11px] text-gray-600 truncate">
                        {e.client_name}{" "}
                        <span className="text-gray-400">· {e.client_code}</span>
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-mono text-gray-600">
                      {e.box_count} 箱 · {e.total_weight_kg} kg
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit bottom sheet for weigh */}
      {editing && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-xl p-4 space-y-3 max-h-[88vh] overflow-auto">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase font-mono text-gray-500">
                  {editing.entry.outbound_id} · {editing.entry.client_name}
                </div>
                <div className="text-lg font-mono font-bold">
                  {editing.box.box_no}
                </div>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="text-gray-400 p-1 -m-1"
                aria-label="close"
              >
                <IconX size={20} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">長 (cm)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.length}
                  onChange={(e) => setForm({ ...form, length: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">闊 (cm)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.width}
                  onChange={(e) => setForm({ ...form, width: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">高 (cm)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.height}
                  onChange={(e) => setForm({ ...form, height: e.target.value })}
                />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="text-[10px] text-gray-500">重量 (kg)</label>
                <span className="text-[10px] font-mono text-gray-500">
                  預期 <b className="text-gray-900">{editing.box.expected_weight_kg.toFixed(2)}</b> kg
                </span>
              </div>
              <Input
                ref={weightInputRef}
                type="number"
                inputMode="decimal"
                step="0.001"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveBox();
                }}
              />
              {(() => {
                const w = Number(form.weight);
                if (!Number.isFinite(w) || w <= 0) {
                  return (
                    <div className="text-[10px] text-gray-400 mt-1 font-mono">
                      上架 {editing.box.sum_actual_weight_kg.toFixed(2)} + 皮重{" "}
                      {editing.box.tare_kg.toFixed(2)} = 預期{" "}
                      {editing.box.expected_weight_kg.toFixed(2)}
                    </div>
                  );
                }
                const diff = Math.abs(w - editing.box.expected_weight_kg);
                const tol = editing.box.tolerance_kg;
                if (diff < 0.001) {
                  return (
                    <div className="text-[10px] text-green-700 mt-1">✓ 與預期一致</div>
                  );
                }
                if (diff <= tol) {
                  return (
                    <div className="text-[10px] text-amber-700 mt-1">
                      ⚠ 差 {diff.toFixed(2)} kg（容差 {tol.toFixed(2)} 內）
                    </div>
                  );
                }
                return (
                  <div className="text-[10px] text-red-700 font-semibold mt-1">
                    ⚠ 差 {diff.toFixed(2)} kg（超出容差 {tol.toFixed(2)}）— 儲存時須再確認
                  </div>
                );
              })()}
            </div>
            <Button className="w-full h-11" onClick={() => saveBox()}>
              <IconCheck size={14} className="mr-1" />
              儲存
            </Button>
          </div>
        </div>
      )}

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
    </div>
  );
}

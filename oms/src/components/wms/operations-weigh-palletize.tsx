"use client";

// Desktop UI for 秤重置板 (weigh + palletize).
//
// Two internal tabs:
//  • 秤重 — list outbounds with sealed-but-not-yet-weighed boxes; per-box
//    L/W/H/weight form. First box of an outbound moves it packed→weighing;
//    when all weighed → weight_verified.
//  • 置板 — scan-confirm every box of a weight_verified outbound. Auto-locks
//    to the first scanned outbound; subsequent scans must be from the same
//    one. 「完成置板」 writes outbound.boxes[] + status pending_client_label.

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

type Toast = { kind: "ok" | "err"; msg: string } | null;

const EMPTY_STATE: State = {
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

function fmtSameClient(hint: SameClientHint[]): string {
  if (hint.length === 0) return "";
  return hint
    .map((h) => `${h.outbound_id} [${h.status}]`)
    .join(" · ");
}

// ── Main component ───────────────────────────────────────────

export function OperationsWeighPalletize() {
  const [state, setState] = useState<State>(EMPTY_STATE);
  const [tab, setTab] = useState<"weigh" | "palletize">("weigh");
  const [tabAutoChosen, setTabAutoChosen] = useState(false);
  const [activeWeighBoxKey, setActiveWeighBoxKey] = useState<string | null>(
    null
  );
  const [form, setForm] = useState({
    length: "",
    width: "",
    height: "",
    weight: "",
  });
  const [scan, setScan] = useState("");
  const [toast, setToast] = useState<Toast>(null);

  const toastTimer = useRef<any>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const weightInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const refresh = useCallback(async () => {
    const r = await apiJson<State>("GET", "/api/wms/outbound/weigh-palletize/state");
    if (r.ok && r.data) setState(r.data);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-jump tab once on initial load
  useEffect(() => {
    if (tabAutoChosen) return;
    if (state.weigh_queue.length === 0 && state.palletize_queue.length > 0) {
      setTab("palletize");
    }
    setTabAutoChosen(true);
  }, [state, tabAutoChosen]);

  // Auto-focus scan input when on palletize tab
  useEffect(() => {
    if (tab === "palletize") {
      setTimeout(() => scanInputRef.current?.focus(), 60);
    }
  }, [tab, state.active_session?.outbound_id]);

  // Auto-focus weight input when a weigh box is selected
  useEffect(() => {
    if (activeWeighBoxKey) {
      setTimeout(() => weightInputRef.current?.focus(), 60);
    }
  }, [activeWeighBoxKey]);

  // Active weigh box derived
  const activeWeighBox = useMemo(() => {
    if (!activeWeighBoxKey) return null;
    for (const e of state.weigh_queue) {
      for (const b of e.boxes) {
        if (`${e.outbound_id}::${b.box_no}` === activeWeighBoxKey) {
          return { entry: e, box: b };
        }
      }
    }
    return null;
  }, [activeWeighBoxKey, state.weigh_queue]);

  // Auto-pick first pending box of first outbound when entering weigh tab
  useEffect(() => {
    if (tab !== "weigh") return;
    if (activeWeighBoxKey) return;
    for (const e of state.weigh_queue) {
      const next = e.boxes.find((b) => !b.weighed);
      if (next) {
        setActiveWeighBoxKey(`${e.outbound_id}::${next.box_no}`);
        setForm({
          length: next.length ? String(next.length) : "",
          width: next.width ? String(next.width) : "",
          height: next.height ? String(next.height) : "",
          weight: next.weight ? String(next.weight) : "",
        });
        return;
      }
    }
  }, [tab, state.weigh_queue, activeWeighBoxKey]);

  function pickWeighBox(entry: WeighEntry, box: WeighBox) {
    setActiveWeighBoxKey(`${entry.outbound_id}::${box.box_no}`);
    setForm({
      length: box.length ? String(box.length) : "",
      width: box.width ? String(box.width) : "",
      height: box.height ? String(box.height) : "",
      weight: box.weight ? String(box.weight) : "",
    });
  }

  async function saveBox(force = false) {
    if (!activeWeighBox) return;
    const { entry, box } = activeWeighBox;
    const length = Number(form.length);
    const width = Number(form.width);
    const height = Number(form.height);
    const weight = Number(form.weight);
    if (!(length > 0 && width > 0 && height > 0 && weight > 0)) {
      showToast("err", "請填寫長 / 闊 / 高 / 重量");
      return;
    }
    const r = await apiJson("POST", "/api/wms/outbound/weigh-palletize/save-box", {
      box_no: box.box_no,
      length,
      width,
      height,
      weight,
      force,
    });
    if (!r.ok) {
      // Diff-over-tolerance: surface a confirm dialog, then retry with force.
      const isWeightDiff =
        typeof r.message === "string" &&
        (r.message.includes("容差") || r.message.includes("tolerance"));
      if (isWeightDiff && !force) {
        const expected = box.expected_weight_kg.toFixed(2);
        const tol = box.tolerance_kg.toFixed(2);
        const diff = Math.abs(weight - box.expected_weight_kg).toFixed(2);
        const ok = window.confirm(
          `⚠ 重量差超出容差\n\n` +
            `預期：${expected} kg（上架重量 ${box.sum_actual_weight_kg.toFixed(
              2
            )} + 皮重 ${box.tare_kg.toFixed(2)}）\n` +
            `實秤：${weight.toFixed(2)} kg\n` +
            `差距：${diff} kg（容差 ${tol} kg）\n\n` +
            `建議再三檢查箱內貨件及秤重。\n是否仍然儲存？`
        );
        if (!ok) return;
        return saveBox(true);
      }
      showToast("err", r.message || "儲存失敗");
      return;
    }
    showToast("ok", `${box.box_no} 已儲存`);
    // Find next pending in the same outbound; if none, jump to next outbound.
    await refresh();
    setTimeout(() => {
      const latest = stateRef.current;
      const sameEntry = latest.weigh_queue.find(
        (e) => e.outbound_id === entry.outbound_id
      );
      let nextKey: string | null = null;
      let nextBox: WeighBox | null = null;
      if (sameEntry) {
        nextBox = sameEntry.boxes.find((b) => !b.weighed) || null;
        if (nextBox) nextKey = `${entry.outbound_id}::${nextBox.box_no}`;
      }
      if (!nextKey) {
        for (const e of latest.weigh_queue) {
          const nb = e.boxes.find((b) => !b.weighed);
          if (nb) {
            nextKey = `${e.outbound_id}::${nb.box_no}`;
            nextBox = nb;
            break;
          }
        }
      }
      if (nextKey && nextBox) {
        setActiveWeighBoxKey(nextKey);
        setForm({
          length: nextBox.length ? String(nextBox.length) : "",
          width: nextBox.width ? String(nextBox.width) : "",
          height: nextBox.height ? String(nextBox.height) : "",
          weight: nextBox.weight ? String(nextBox.weight) : "",
        });
        setTimeout(() => weightInputRef.current?.focus(), 50);
      } else {
        setActiveWeighBoxKey(null);
        setForm({ length: "", width: "", height: "", weight: "" });
      }
    }, 80);
  }

  // State ref for cross-async access in saveBox
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ── Palletize tab ──────────────────────────────────────────

  async function submitScan() {
    const code = scan.trim();
    if (!code) return;
    const r = await apiJson<{ active_session: any }>(
      "POST",
      "/api/wms/outbound/weigh-palletize/scan-box",
      { box_no: code }
    );
    setScan("");
    if (!r.ok) {
      showToast("err", r.message || `掃描失敗：${code}`);
      return;
    }
    showToast("ok", `${code} 已掃`);
    await refresh();
    setTimeout(() => scanInputRef.current?.focus(), 50);
  }

  async function completePalletize() {
    if (!state.active_session) return;
    const oid = state.active_session.outbound_id;
    const r = await apiJson(
      "POST",
      "/api/wms/outbound/weigh-palletize/complete",
      { outbound_id: oid }
    );
    if (!r.ok) {
      showToast("err", r.message || "完成置板失敗");
      return;
    }
    showToast("ok", `${oid} 已完成置板`);
    await refresh();
    setTimeout(() => scanInputRef.current?.focus(), 50);
  }

  async function cancelSession() {
    if (!state.active_session) return;
    if (!confirm("暫停此置板？已掃描的記錄會保留。")) return;
    const r = await apiJson(
      "POST",
      "/api/wms/outbound/weigh-palletize/cancel-session"
    );
    if (!r.ok) {
      showToast("err", r.message || "暫停失敗");
      return;
    }
    showToast("ok", "已暫停置板");
    await refresh();
  }

  // ── Render ────────────────────────────────────────────────

  const weighCount = state.weigh_queue.reduce(
    (s, e) => s + e.boxes.filter((b) => !b.weighed).length,
    0
  );
  const palletizeCount = state.palletize_queue.length;
  const session = state.active_session;

  return (
    <div className="flex flex-col" style={{ minHeight: 560 }}>
      {/* ── Tab strip ───────────────────────────────────── */}
      <div className="flex items-center justify-between border-b bg-white sticky top-0 z-10">
        <div className="flex">
          <button
            onClick={() => setTab("weigh")}
            className={cn(
              "px-5 py-3 text-sm font-medium border-b-2",
              tab === "weigh"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-800"
            )}
          >
            <IconScale size={16} className="inline mr-1.5 -mt-0.5" />
            秤重 · <span className="font-mono">{weighCount}</span> 箱待秤
          </button>
          <button
            onClick={() => setTab("palletize")}
            className={cn(
              "px-5 py-3 text-sm font-medium border-b-2",
              tab === "palletize"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-800"
            )}
          >
            <IconScan size={16} className="inline mr-1.5 -mt-0.5" />
            置板 · <span className="font-mono">{palletizeCount}</span> 單待置
            {session && (
              <span className="ml-2 text-[10px] bg-blue-100 text-blue-800 px-1.5 py-px rounded">
                進行中
              </span>
            )}
          </button>
        </div>
        <div className="pr-3">
          <Button variant="outline" size="sm" onClick={refresh}>
            <IconRefresh size={14} className="mr-1" />
            重新整理
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4">
        {tab === "weigh" ? (
          <WeighTab
            weighQueue={state.weigh_queue}
            activeKey={activeWeighBoxKey}
            form={form}
            setForm={setForm}
            onPick={pickWeighBox}
            onSave={saveBox}
            weightInputRef={weightInputRef}
            activeWeighBox={activeWeighBox}
          />
        ) : (
          <PalletizeTab
            palletizeQueue={state.palletize_queue}
            session={session}
            scan={scan}
            setScan={setScan}
            submitScan={submitScan}
            completePalletize={completePalletize}
            cancelSession={cancelSession}
            scanInputRef={scanInputRef}
          />
        )}
      </div>

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 px-3 py-2 rounded text-xs text-white shadow-lg z-50",
            toast.kind === "ok" ? "bg-green-600" : "bg-red-600"
          )}
        >
          {toast.kind === "ok" ? "✓ " : "! "}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── 秤重 tab ────────────────────────────────────────────────

function WeighTab({
  weighQueue,
  activeKey,
  form,
  setForm,
  onPick,
  onSave,
  weightInputRef,
  activeWeighBox,
}: {
  weighQueue: WeighEntry[];
  activeKey: string | null;
  form: { length: string; width: string; height: string; weight: string };
  setForm: (f: any) => void;
  onPick: (e: WeighEntry, b: WeighBox) => void;
  onSave: () => void;
  weightInputRef: React.RefObject<HTMLInputElement | null>;
  activeWeighBox: { entry: WeighEntry; box: WeighBox } | null;
}) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 360px" }}>
      {/* Left: outbound list */}
      <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {weighQueue.length === 0 && (
          <div className="text-sm text-gray-500 border border-dashed rounded p-8 text-center">
            暫無待秤重的箱
          </div>
        )}
        {weighQueue.map((e) => (
          <div
            key={e.outbound_id}
            className="bg-white border rounded p-3 space-y-2"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-mono font-bold text-sm">{e.outbound_id}</div>
                <div className="text-xs text-gray-600">
                  {e.client_name}{" "}
                  <span className="text-gray-400">· {e.client_code}</span>
                </div>
              </div>
              <div className="text-[11px] font-mono text-gray-500">
                <span className="bg-gray-100 px-1.5 py-px rounded">
                  {e.outbound_status}
                </span>
                {e.shipment_type === "single" && (
                  <span className="ml-1 bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-px">
                    直發
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {e.boxes.map((b) => {
                const key = `${e.outbound_id}::${b.box_no}`;
                const isActive = key === activeKey;
                return (
                  <button
                    key={b.box_no}
                    disabled={b.weighed}
                    onClick={() => onPick(e, b)}
                    className={cn(
                      "border rounded p-2 text-left text-xs",
                      b.weighed
                        ? "bg-gray-50 border-gray-200 text-gray-400 cursor-default"
                        : isActive
                        ? "bg-blue-50 border-blue-400 ring-2 ring-blue-300"
                        : "bg-white border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    <div className="font-mono font-bold flex justify-between">
                      <span>{b.box_no}</span>
                      {b.weighed ? (
                        <span className="text-green-600 text-[10px]">
                          <IconCheck size={11} className="inline" /> 已秤
                        </span>
                      ) : (
                        <span className="text-amber-600 text-[10px]">未秤</span>
                      )}
                    </div>
                    {b.weighed && (
                      <div className="text-[10px] text-gray-500 font-mono mt-1">
                        {b.length}·{b.width}·{b.height}cm · {b.weight}kg
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Right: weigh form */}
      <div className="bg-white border rounded p-4 sticky top-2 self-start">
        {!activeWeighBox ? (
          <div className="text-center text-gray-500 text-sm py-12">
            從左側選擇一箱開始秤重
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide font-mono">
                {activeWeighBox.entry.outbound_id} · {activeWeighBox.entry.client_name}
              </div>
              <div className="text-xl font-mono font-bold">
                {activeWeighBox.box.box_no}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">
                  長 (cm)
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.length}
                  onChange={(e) => setForm({ ...form, length: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">
                  闊 (cm)
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.width}
                  onChange={(e) => setForm({ ...form, width: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">
                  高 (cm)
                </label>
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
                <label className="text-[11px] text-gray-500">重量 (kg)</label>
                <span className="text-[11px] font-mono text-gray-500">
                  預期 <b className="text-gray-900">{activeWeighBox.box.expected_weight_kg.toFixed(2)}</b> kg
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
                  if (e.key === "Enter") onSave();
                }}
              />
              {(() => {
                const w = Number(form.weight);
                if (!Number.isFinite(w) || w <= 0) {
                  return (
                    <div className="text-[10px] text-gray-400 mt-1 font-mono">
                      上架重量 {activeWeighBox.box.sum_actual_weight_kg.toFixed(2)} ＋ 皮重{" "}
                      {activeWeighBox.box.tare_kg.toFixed(2)} = 預期{" "}
                      {activeWeighBox.box.expected_weight_kg.toFixed(2)} kg
                    </div>
                  );
                }
                const diff = Math.abs(w - activeWeighBox.box.expected_weight_kg);
                const tol = activeWeighBox.box.tolerance_kg;
                if (diff < 0.001) {
                  return (
                    <div className="text-[11px] text-green-700 mt-1">
                      ✓ 與預期一致
                    </div>
                  );
                }
                if (diff <= tol) {
                  return (
                    <div className="text-[11px] text-amber-700 mt-1">
                      ⚠ 與預期差 {diff.toFixed(2)} kg（容差 {tol.toFixed(2)} kg
                      內，可直接儲存）
                    </div>
                  );
                }
                return (
                  <div className="text-[11px] text-red-700 font-semibold mt-1">
                    ⚠ 與預期差 {diff.toFixed(2)} kg（超出容差 {tol.toFixed(2)}{" "}
                    kg）— 儲存時須再確認
                  </div>
                );
              })()}
            </div>
            <Button className="w-full" onClick={() => onSave()}>
              <IconCheck size={14} className="mr-1" />
              儲存並下一箱
            </Button>
            <div className="text-[10px] text-gray-400 text-center">
              按 Enter 儲存
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 置板 tab ────────────────────────────────────────────────

function PalletizeTab({
  palletizeQueue,
  session,
  scan,
  setScan,
  submitScan,
  completePalletize,
  cancelSession,
  scanInputRef,
}: {
  palletizeQueue: PalletizeEntry[];
  session: ActiveSession | null;
  scan: string;
  setScan: (s: string) => void;
  submitScan: () => void;
  completePalletize: () => void;
  cancelSession: () => void;
  scanInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-4">
      {/* Sticky session panel */}
      <div
        className={cn(
          "border rounded-lg p-4 space-y-3 sticky top-2 z-10",
          session ? "bg-blue-50 border-blue-300" : "bg-white"
        )}
      >
        {session ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide font-mono">
                  進行中
                </div>
                <div className="text-lg font-mono font-bold">
                  {session.outbound_id}
                </div>
                <div className="text-xs text-gray-700">
                  {session.client_name}{" "}
                  <span className="text-gray-400">· {session.client_code}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono font-bold">
                  {session.scanned_box_nos.length}
                  <span className="text-base text-gray-500"> / {session.total}</span>
                </div>
                <div className="text-[10px] text-gray-500">進度</div>
              </div>
            </div>
            {session.same_client_hint.length > 0 && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                賣家 <b>{session.client_name}</b> 還有{" "}
                <b>{session.same_client_hint.length}</b> 張未離站 — 建議放在一起：
                {fmtSameClient(session.same_client_hint)}
              </div>
            )}
            <div className="flex gap-2 items-center">
              <Input
                ref={scanInputRef}
                value={scan}
                placeholder="掃描 / 輸入箱號 (例如 BOX-XXX-001) …"
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitScan();
                }}
                autoFocus
                className="flex-1 font-mono"
              />
              <Button onClick={submitScan} disabled={!scan.trim()}>
                <IconScan size={14} className="mr-1" />
                掃描
              </Button>
            </div>
            {session.remaining_box_nos.length > 0 && (
              <div className="text-[11px] text-gray-600">
                待掃：
                {session.remaining_box_nos.map((bn) => (
                  <span
                    key={bn}
                    className="inline-block ml-1 font-mono bg-white border rounded px-1.5 py-px"
                  >
                    {bn}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                onClick={completePalletize}
                disabled={!session.complete_ready}
                className="flex-1"
              >
                <IconCheck size={14} className="mr-1" />
                完成置板
              </Button>
              <Button variant="outline" onClick={cancelSession}>
                <IconX size={14} className="mr-1" />
                暫停
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide font-mono">
                  待置板
                </div>
                <div className="text-sm text-gray-700">
                  掃描任何待置板的箱以開始 — 系統會自動鎖定該出庫單
                </div>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                ref={scanInputRef}
                value={scan}
                placeholder="掃描 / 輸入箱號 (例如 BOX-XXX-001) …"
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitScan();
                }}
                autoFocus
                className="flex-1 font-mono"
              />
              <Button onClick={submitScan} disabled={!scan.trim()}>
                <IconScan size={14} className="mr-1" />
                掃描
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Queue list */}
      <div>
        <div className="text-[11px] uppercase tracking-wide font-mono text-gray-500 mb-2">
          待置板隊列 · {palletizeQueue.length}
        </div>
        {palletizeQueue.length === 0 && !session && (
          <div className="text-sm text-gray-500 border border-dashed rounded p-8 text-center">
            暫無待置板的出庫單
          </div>
        )}
        <div className="space-y-2">
          {palletizeQueue.map((e) => (
            <div key={e.outbound_id} className="bg-white border rounded p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono font-bold text-sm">{e.outbound_id}</div>
                  <div className="text-xs text-gray-600">
                    {e.client_name}{" "}
                    <span className="text-gray-400">· {e.client_code}</span>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-mono">
                    {e.box_count} 箱 · {e.total_weight_kg} kg
                  </div>
                  {e.shipment_type === "single" && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-px">
                      直發
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {e.boxes.map((b) => (
                  <span
                    key={b.box_no}
                    className="text-[10px] font-mono bg-gray-100 border rounded px-1.5 py-px"
                  >
                    {b.box_no}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

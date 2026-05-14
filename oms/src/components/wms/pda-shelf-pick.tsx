"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface ShelfItem {
  inbound_id: string;
  tracking_no: string;
  client_id: string;
  client_short: string;
  client_code: string | null;
  outbound_id: string;
  outbound_short: string;
  declared_name: string | null;
  thumbnail_path: string | null;
  status: "pending" | "picked";
  actualWeight: number | null;
}

interface ShelfResponse {
  locationCode: string;
  batch_id: string;
  total_items: number;
  pending_items: number;
  client_count: number;
  items: ShelfItem[];
}

interface BatchRow {
  _id: string;
  status: string;
  outbound_ids: string[];
  started_at: string | null;
  note: string | null;
}

interface ShelfRow {
  locationCode: string;
  pending_count: number;
  total_count: number;
}

type View = "batches" | "shelves" | "items";

export const PdaShelfPick = () => {
  const t = useTranslations();
  const [view, setView] = useState<View>("batches");
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [shelves, setShelves] = useState<ShelfRow[]>([]);
  const [locationCode, setLocationCode] = useState("");
  const [data, setData] = useState<ShelfResponse | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scanRef = useRef<HTMLInputElement | null>(null);

  const loadBatches = async () => {
    setBusy(true);
    setError("");
    try {
      // Mirror desktop visibility: both draft and picking show up. Picker
      // can browse the shelves of a draft batch but the pickByTracking
      // call will reject scans until the batch is started on desktop.
      const r = await http_request(
        "GET",
        "/api/wms/pick-batch?status=draft,picking",
        {}
      );
      const d = await r.json();
      if (d.status !== 200) {
        setError(d.message ?? "load batches failed");
        setBatches([]);
        return;
      }
      const rows: BatchRow[] = d.data ?? [];
      setBatches(rows);
      if (rows.length === 1) {
        await selectBatch(rows[0]._id);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const loadShelves = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await http_request(
        "GET",
        `/api/wms/pick-batch/${encodeURIComponent(id)}/shelves`,
        {}
      );
      const d = await r.json();
      if (d.status === 200) {
        setShelves(d.data.shelves ?? []);
      } else {
        setError(d.message ?? "load shelves failed");
        setShelves([]);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const selectBatch = async (id: string) => {
    setBatchId(id);
    setView("shelves");
    await loadShelves(id);
  };

  const openShelf = async (code: string) => {
    if (!code.trim() || !batchId) return;
    setBusy(true);
    setError("");
    try {
      const r = await http_request(
        "GET",
        `/api/wms/pick-batch/by-location/${encodeURIComponent(code.trim())}?batchId=${encodeURIComponent(batchId)}`,
        {}
      );
      const d = await r.json();
      if (d.status === 200) {
        setData(d.data);
        setView("items");
      } else {
        setError(d.message ?? "load failed");
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const backToShelves = async () => {
    setData(null);
    setLocationCode("");
    setView("shelves");
    if (batchId) await loadShelves(batchId);
  };

  const switchBatch = () => {
    setBatchId(null);
    setShelves([]);
    setData(null);
    setLocationCode("");
    setView("batches");
    loadBatches();
  };

  const pickByScan = async (rawTracking: string) => {
    const tracking = rawTracking.trim();
    if (!tracking || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await http_request(
        "POST",
        "/api/wms/outbound/pick-by-tracking",
        {
          tracking_no: tracking,
          locationCode: data?.locationCode,
          batch_id: batchId,
        }
      );
      const d = await r.json();
      if (d.status === 200) {
        setFlash(t("wms_pda.shelf_pick.picked_flash"));
        setTimeout(() => setFlash(""), 1200);
        setScanInput("");
        if (!data || !batchId) return;
        const refreshed = await fetch(
          `/api/wms/pick-batch/by-location/${encodeURIComponent(data.locationCode)}?batchId=${encodeURIComponent(batchId)}`,
          { credentials: "same-origin" }
        );
        const rd = await refreshed.json();
        if (rd.status === 200) {
          setData(rd.data);
          // Auto-return to shelves overview when this shelf is cleared.
          if (rd.data.pending_items === 0 && rd.data.total_items > 0) {
            setTimeout(() => backToShelves(), 1500);
          }
        }
      } else {
        setError(d.message ?? "pick failed");
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
      setTimeout(() => scanRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    if (view === "shelves") inputRef.current?.focus();
    if (view === "items") scanRef.current?.focus();
  }, [view]);

  return (
    <div className="px-3 py-4 max-w-md mx-auto grid gap-3">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</div>
      )}
      {flash && (
        <div className="text-xs text-emerald-700 bg-emerald-50 rounded p-2 text-center">
          {flash}
        </div>
      )}

      {view === "batches" && (
        <>
          <h2 className="font-semibold text-sm">
            {t("wms_pda.shelf_pick.choose_batch_title")}
          </h2>
          {batches !== null && batches.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-8">
              {t("wms_pda.shelf_pick.no_active_batch")}
            </div>
          )}
          {batches?.map((b) => (
            <Card
              key={b._id}
              className="cursor-pointer hover:bg-gray-50"
              onClick={() => selectBatch(b._id)}
            >
              <CardContent className="pt-3 grid gap-1">
                <div className="font-mono text-sm">{b._id}</div>
                <div className="text-xs text-gray-500">
                  {t("wms_pda.shelf_pick.batch_row_outbounds", {
                    n: b.outbound_ids?.length ?? 0,
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {view === "shelves" && batchId && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-sm">
                {t("wms_pda.shelf_pick.shelves_title")}
              </h2>
              <div className="text-xs text-gray-500 font-mono">{batchId}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={switchBatch}
              disabled={busy}
            >
              {t("wms_pda.shelf_pick.switch_batch")}
            </Button>
          </div>

          <Card>
            <CardContent className="pt-4 grid gap-2">
              <Label className="text-xs text-gray-500">
                {t("wms_pda.shelf_pick.location_label")}
              </Label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  openShelf(locationCode);
                }}
                className="flex gap-2"
              >
                <Input
                  ref={inputRef}
                  value={locationCode}
                  onChange={(e) => setLocationCode(e.target.value)}
                  placeholder={t("wms_pda.shelf_pick.location_placeholder")}
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="flex-1"
                />
                <Button type="submit" disabled={busy}>
                  {t("wms_pda.shelf_pick.scan_btn")}
                </Button>
              </form>
            </CardContent>
          </Card>

          {shelves.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-8">
              {t("wms_pda.shelf_pick.no_shelves")}
            </div>
          ) : (
            shelves.map((s) => (
              <Card
                key={s.locationCode}
                className={`cursor-pointer hover:bg-gray-50 ${
                  s.pending_count === 0 ? "opacity-60" : ""
                }`}
                onClick={() => openShelf(s.locationCode)}
              >
                <CardContent className="pt-3 flex items-center justify-between">
                  <div className="font-mono text-sm">{s.locationCode}</div>
                  <div className="text-xs">
                    {s.pending_count === 0
                      ? t("wms_pda.shelf_pick.shelf_done_label")
                      : t("wms_pda.shelf_pick.shelf_pending_label", {
                          n: s.pending_count,
                        })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}

      {view === "items" && data && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={backToShelves}
            disabled={busy}
            className="w-fit"
          >
            {t("wms_pda.shelf_pick.back_to_shelves")}
          </Button>

          <Card>
            <CardContent className="pt-4 grid gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500">
                    {t("wms_pda.shelf_pick.location_summary_label")}
                  </div>
                  <div className="font-mono text-sm">{data.locationCode}</div>
                </div>
                <div className="text-xs text-gray-500 text-right">
                  {t("wms_pda.shelf_pick.pending_summary", {
                    pending: data.pending_items,
                    total: data.total_items,
                  })}
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  pickByScan(scanInput);
                }}
                className="flex gap-2"
              >
                <Input
                  ref={scanRef}
                  autoFocus
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder={t("wms_pda.shelf_pick.scan_tracking_placeholder")}
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="flex-1"
                />
                <Button type="submit" disabled={busy || !scanInput.trim()}>
                  {t("wms_pda.shelf_pick.scan_btn")}
                </Button>
              </form>
              {data.pending_items === 0 && data.total_items > 0 && (
                <div className="text-sm text-emerald-700 bg-emerald-50 rounded p-2 text-center">
                  {t("wms_pda.shelf_pick.shelf_cleared")}
                </div>
              )}
            </CardContent>
          </Card>

          {data.items.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-8">
              {t("wms_pda.shelf_pick.empty")}
            </div>
          )}

          {data.items.map((it) => (
            <Card
              key={it.inbound_id}
              className={it.status === "picked" ? "opacity-50" : ""}
            >
              <CardContent className="pt-3 grid grid-cols-[80px_1fr] gap-3">
                <div className="w-20 h-20 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                  {it.thumbnail_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.thumbnail_path}
                      alt={it.tracking_no}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-gray-400">no photo</span>
                  )}
                </div>
                <div className="grid gap-1 min-w-0">
                  <div className="font-mono text-xs">{it.tracking_no}</div>
                  {it.client_code && (
                    <div className="text-xs text-gray-500 font-mono">
                      {it.client_code}
                    </div>
                  )}
                  {it.declared_name && (
                    <div className="text-xs text-gray-700 break-words">
                      {it.declared_name}
                    </div>
                  )}
                  {it.status === "picked" && (
                    <div className="text-xs text-emerald-700 font-medium">
                      ✓ {t("wms_pda.shelf_pick.picked_badge")}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
};

"use client";
// Desktop 揀貨 — shelf-keyed, picker-first view. Per the WMS rule:
//   picker only sees (shelf, tracking). Outbound / client groupings
//   show up at pack/weigh time, not here.
// Top barcode input scans a tracking_no to mark it picked; the page
// re-loads to reflect new pending counts and items.
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface ShelfItem {
  inbound_id: string;
  tracking_no: string;
  declared_name: string | null;
  thumbnail_path: string | null;
  status: "pending" | "picked";
}

interface ShelfBlock {
  locationCode: string;
  pending_count: number;
  total_count: number;
  items: ShelfItem[];
}

interface BatchRow {
  _id: string;
  status: string;
  outbound_ids: string[];
}

interface ShelfResponse {
  locationCode: string;
  batch_id: string;
  total_items: number;
  pending_items: number;
  items: Array<{
    inbound_id: string;
    tracking_no: string;
    declared_name: string | null;
    thumbnail_path: string | null;
    status: "pending" | "picked";
  }>;
}

export const OperationsPick = () => {
  const t = useTranslations();
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchOptions, setBatchOptions] = useState<BatchRow[]>([]);
  const [shelves, setShelves] = useState<ShelfBlock[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const scanRef = useRef<HTMLInputElement | null>(null);

  const loadAll = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await http_request(
        "GET",
        `/api/wms/pick-batch/${encodeURIComponent(id)}/shelves`,
        {}
      );
      const d = await r.json();
      if (d.status !== 200) {
        setError(d.message ?? "load failed");
        setShelves([]);
        return;
      }
      const overview: { locationCode: string; pending_count: number; total_count: number }[] =
        d.data.shelves ?? [];
      // For each shelf fetch the items in parallel.
      const detailed = await Promise.all(
        overview.map(async (s) => {
          const rr = await http_request(
            "GET",
            `/api/wms/pick-batch/by-location/${encodeURIComponent(s.locationCode)}?batchId=${encodeURIComponent(id)}`,
            {}
          );
          const dd = await rr.json();
          const items: ShelfItem[] =
            dd.status === 200
              ? (dd.data as ShelfResponse).items.map((it) => ({
                  inbound_id: it.inbound_id,
                  tracking_no: it.tracking_no,
                  declared_name: it.declared_name,
                  thumbnail_path: it.thumbnail_path,
                  status: it.status,
                }))
              : [];
          return {
            locationCode: s.locationCode,
            pending_count: s.pending_count,
            total_count: s.total_count,
            items,
          };
        })
      );
      setShelves(detailed);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
      setTimeout(() => scanRef.current?.focus(), 0);
    }
  };

  const loadBatches = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await http_request(
        "GET",
        "/api/wms/pick-batch?status=picking",
        {}
      );
      const d = await r.json();
      if (d.status !== 200) {
        setError(d.message ?? "load batches failed");
        return;
      }
      const rows: BatchRow[] = d.data ?? [];
      setBatchOptions(rows);
      if (rows.length === 1) {
        setBatchId(rows[0]._id);
        await loadAll(rows[0]._id);
      } else if (rows.length === 0) {
        setBatchId(null);
        setShelves([]);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const pickByScan = async () => {
    const tracking = scanInput.trim();
    if (!tracking || busy || !batchId) return;
    setBusy(true);
    setError("");
    try {
      const r = await http_request("POST", "/api/wms/outbound/pick-by-tracking", {
        tracking_no: tracking,
        batch_id: batchId,
      });
      const d = await r.json();
      if (d.status === 200) {
        setFlash(t("wms_ops.pick.picked_flash"));
        setTimeout(() => setFlash(""), 1200);
        setScanInput("");
        await loadAll(batchId);
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

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 grid gap-4">
      <Card>
        <CardContent className="pt-4 grid gap-3">
          {batchOptions.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {t("wms_ops.pick.batch_select_label")}
              </span>
              <select
                className="border rounded h-9 px-2 text-sm"
                value={batchId ?? ""}
                onChange={(e) => {
                  setBatchId(e.target.value);
                  if (e.target.value) loadAll(e.target.value);
                }}
              >
                <option value="">—</option>
                {batchOptions.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b._id}
                  </option>
                ))}
              </select>
            </div>
          )}
          {batchId ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono">{batchId}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">
                {t("wms_ops.pick.shelves_count", { n: shelves.length })}
              </span>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              {t("wms_ops.pick.no_active_batch")}
            </div>
          )}
          {batchId && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                pickByScan();
              }}
              className="flex gap-2"
            >
              <Input
                ref={scanRef}
                autoFocus
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder={t("wms_ops.pick.scan_tracking_placeholder")}
                autoComplete="off"
                autoCapitalize="characters"
                className="flex-1 font-mono"
              />
              <Button type="submit" disabled={busy || !scanInput.trim()}>
                {t("wms_ops.pick.scan_btn")}
              </Button>
            </form>
          )}
          {flash && (
            <div className="text-sm text-emerald-700 bg-emerald-50 rounded p-2">
              {flash}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded p-2">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {shelves.length === 0 && batchId && !busy && (
        <div className="text-sm text-gray-400 text-center py-12">
          {t("wms_ops.pick.no_shelves")}
        </div>
      )}

      {shelves.map((shelf) => (
        <Card key={shelf.locationCode}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-base font-mono">
                {shelf.locationCode}
              </div>
              <div className="text-xs text-gray-500">
                {shelf.pending_count === 0
                  ? t("wms_ops.pick.shelf_done_label")
                  : t("wms_ops.pick.shelf_pending_label", {
                      n: shelf.pending_count,
                    })}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {shelf.items.map((it) => (
                <div
                  key={it.inbound_id}
                  className={`border rounded p-2 grid grid-cols-[56px_1fr] gap-2 ${
                    it.status === "picked"
                      ? "opacity-50 line-through"
                      : "bg-white"
                  }`}
                >
                  <div className="w-14 h-14 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
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
                  <div className="grid gap-0.5">
                    <div className="font-mono text-xs">{it.tracking_no}</div>
                    {it.declared_name && (
                      <div className="text-xs text-gray-600 truncate">
                        {it.declared_name}
                      </div>
                    )}
                    {it.status === "picked" && (
                      <div className="text-xs text-emerald-700 font-medium">
                        ✓
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

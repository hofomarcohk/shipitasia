"use client";

import { Button } from "@/components/ui/button";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface ShelfItem {
  inbound_id: string;
  tracking_no: string;
  declared_name: string | null;
  status: "pending" | "picked";
}

interface ShelfBlock {
  locationCode: string;
  pending_count: number;
  total_count: number;
  items: ShelfItem[];
}

export const PickSheetPrint = ({ batchId }: { batchId: string }) => {
  const t = useTranslations();
  const [shelves, setShelves] = useState<ShelfBlock[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  // Defer "now" formatting to the client so SSR and hydrate match. Avoids
  // a hydration mismatch when server and client clocks differ by ms.
  const [printedAt, setPrintedAt] = useState("");
  useEffect(() => {
    setPrintedAt(new Date().toLocaleString());
  }, []);

  useEffect(() => {
    (async () => {
      const r = await http_request(
        "GET",
        `/api/wms/pick-batch/${encodeURIComponent(batchId)}/shelves`,
        {}
      );
      const d = await r.json();
      if (d.status !== 200) {
        setLoading(false);
        return;
      }
      const overview: Array<{
        locationCode: string;
        pending_count: number;
        total_count: number;
      }> = d.data.shelves ?? [];
      const detailed = await Promise.all(
        overview.map(async (s) => {
          const rr = await http_request(
            "GET",
            `/api/wms/pick-batch/by-location/${encodeURIComponent(s.locationCode)}?batchId=${encodeURIComponent(batchId)}`,
            {}
          );
          const dd = await rr.json();
          const items: ShelfItem[] =
            dd.status === 200
              ? (dd.data.items ?? []).map((it: any) => ({
                  inbound_id: it.inbound_id,
                  tracking_no: it.tracking_no,
                  declared_name: it.declared_name,
                  status: it.status,
                }))
              : [];
          return {
            locationCode: s.locationCode,
            pending_count: s.pending_count,
            total_count: s.total_count,
            items: items.filter((it) => it.status === "pending"),
          };
        })
      );
      const filtered = detailed.filter((s) => s.items.length > 0);
      setShelves(filtered);
      setTotalPending(filtered.reduce((sum, s) => sum + s.items.length, 0));
      setLoading(false);
    })();
  }, [batchId]);

  return (
    <div className="bg-white text-black min-h-screen p-6 print:p-4 max-w-3xl mx-auto">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
          body { font-size: 12px; }
        }
      `}</style>
      <div className="no-print mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("wms_ops.pick_batch.print_title")}</h1>
        <Button onClick={() => window.print()}>{t("wms_ops.pick_batch.print_btn")}</Button>
      </div>

      <header className="border-b pb-3 mb-4">
        <h2 className="text-lg font-bold print:text-xl">
          {t("wms_ops.pick_batch.print_title")}
        </h2>
        <div className="grid grid-cols-3 gap-2 text-sm mt-2">
          <div>
            <span className="text-gray-500">{t("wms_ops.pick_batch.print_batch_no")}</span>
            <div className="font-mono">{batchId}</div>
          </div>
          <div>
            <span className="text-gray-500">{t("wms_ops.pick_batch.print_total_items")}</span>
            <div className="font-semibold">{totalPending}</div>
          </div>
          <div>
            <span className="text-gray-500">{t("wms_ops.pick_batch.print_generated_at")}</span>
            <div suppressHydrationWarning>{printedAt}</div>
          </div>
        </div>
      </header>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {!loading && shelves.length === 0 && (
        <p className="text-sm text-gray-500">
          {t("wms_ops.pick_batch.print_no_pending")}
        </p>
      )}

      {shelves.map((shelf) => (
        <section
          key={shelf.locationCode}
          className="mb-6 break-inside-avoid"
        >
          <div className="flex items-end justify-between border-b border-black pb-1 mb-2">
            <h3 className="text-base font-bold font-mono">
              {shelf.locationCode}
            </h3>
            <div className="text-xs text-gray-600">
              {t("wms_ops.pick_batch.print_shelf_count", {
                n: shelf.items.length,
              })}
            </div>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-600 border-b">
                <th className="py-1 pr-2 w-10">#</th>
                <th className="py-1 pr-2">{t("wms_ops.pick_batch.print_col_tracking")}</th>
                <th className="py-1 pr-2">{t("wms_ops.pick_batch.print_col_item")}</th>
                <th className="py-1 pr-2 w-10 text-center">
                  {t("wms_ops.pick_batch.print_col_check")}
                </th>
              </tr>
            </thead>
            <tbody>
              {shelf.items.map((it, i) => (
                <tr key={it.inbound_id} className="border-b border-gray-300">
                  <td className="py-1 pr-2 text-gray-500">{i + 1}</td>
                  <td className="py-1 pr-2 font-mono">{it.tracking_no}</td>
                  <td className="py-1 pr-2">{it.declared_name ?? "—"}</td>
                  <td className="py-1 pr-2 text-center">☐</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <footer className="mt-8 pt-3 border-t text-xs text-gray-500">
        {t("wms_ops.pick_batch.print_footer_hint")}
      </footer>
    </div>
  );
};

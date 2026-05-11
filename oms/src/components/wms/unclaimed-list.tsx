"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Row {
  _id: string;
  carrier_inbound_code: string;
  tracking_no: string;
  weight: number;
  dimension: { length: number; width: number; height: number };
  photo_paths: string[];
  staff_note: string;
  status: "pending_assignment" | "assigned" | "disposed";
  arrived_at: string;
  arrived_by_staff_id: string;
}

export const UnclaimedList = () => {
  const t = useTranslations();
  const [status, setStatus] = useState<
    "pending_assignment" | "assigned" | "disposed"
  >("pending_assignment");
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await http_request("GET", "/api/wms/unclaimed-inbounds", {
        status,
      });
      const d = await r.json();
      if (d.status === 200) setItems(d.data);
      setLoading(false);
    })();
  }, [status]);

  return (
    <div className="max-w-5xl mx-auto py-4 px-3 grid gap-3">
      <h1 className="text-2xl font-semibold">
        {t("wms_scan.page_title_unclaimed")}
      </h1>
      <Tabs value={status} onValueChange={(v) => setStatus(v as any)}>
        <TabsList>
          <TabsTrigger value="pending_assignment">
            {t("wms_scan.unclaimed_status_pending_assignment")}
          </TabsTrigger>
          <TabsTrigger value="assigned">
            {t("wms_scan.unclaimed_status_assigned")}
          </TabsTrigger>
          <TabsTrigger value="disposed">
            {t("wms_scan.unclaimed_status_disposed")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Card>
        <CardContent className="py-3">
          {loading ? (
            <p className="text-gray-500 py-6 text-center">
              {t("common.loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="text-gray-500 py-12 text-center">
              {t("wms_scan.unclaimed_empty")}
            </p>
          ) : (
            <div className="grid gap-2">
              {items.map((r) => (
                <div key={r._id} className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{r._id}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 border">
                      {t(`wms_scan.unclaimed_status_${r.status}` as any)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700 mt-1">
                    {r.carrier_inbound_code} · tracking{" "}
                    <span className="font-mono">{r.tracking_no}</span> ·{" "}
                    {r.weight}kg · {r.dimension.length}×{r.dimension.width}×
                    {r.dimension.height}cm
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    員工備註：{r.staff_note}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {t("wms_scan.unclaimed_arrived_at")}{" "}
                    {new Date(r.arrived_at).toLocaleString()} · operator{" "}
                    {r.arrived_by_staff_id.substring(0, 10)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

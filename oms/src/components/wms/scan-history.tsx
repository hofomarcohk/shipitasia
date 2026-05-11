"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface ScanRow {
  _id: string;
  inbound_request_id: string | null;
  unclaimed_inbound_id: string | null;
  type: string;
  locationCode: string | null;
  weight: number | null;
  photo_paths: string[];
  anomalies: { code: string; note: string }[];
  operator_staff_id: string;
  staff_note: string | null;
  cancelled_at: string | null;
  createdAt: string;
}

export const ScanHistory = () => {
  const t = useTranslations();
  const [filterType, setFilterType] = useState<string>("all");
  const [items, setItems] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await http_request("GET", "/api/wms/inbound-scans", {
        type: filterType !== "all" ? filterType : undefined,
        page_size: 200,
      });
      const d = await r.json();
      if (d.status === 200) setItems(d.data.items);
      setLoading(false);
    })();
  }, [filterType]);

  return (
    <div className="max-w-6xl mx-auto py-4 px-3 grid gap-3">
      <h1 className="text-2xl font-semibold">{t("wms_scan.page_title_history")}</h1>

      <Tabs value={filterType} onValueChange={setFilterType}>
        <TabsList>
          <TabsTrigger value="all">{t("wms_scan.history_filter_all")}</TabsTrigger>
          <TabsTrigger value="arrive">{t("wms_scan.type_arrive")}</TabsTrigger>
          <TabsTrigger value="receive">{t("wms_scan.type_receive")}</TabsTrigger>
          <TabsTrigger value="unclaimed_arrive">
            {t("wms_scan.type_unclaimed_arrive")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-gray-500 py-12 text-center">
              {t("common.loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="text-gray-500 py-12 text-center">No scans</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b bg-gray-50">
                    <th className="p-2">{t("wms_scan.history_time")}</th>
                    <th className="p-2">{t("wms_scan.history_type")}</th>
                    <th className="p-2">{t("wms_scan.history_inbound")}</th>
                    <th className="p-2">{t("wms_scan.history_location")}</th>
                    <th className="p-2">Wt</th>
                    <th className="p-2">{t("wms_scan.history_photos")}</th>
                    <th className="p-2">{t("wms_scan.history_anomaly")}</th>
                    <th className="p-2">{t("wms_scan.history_operator")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr
                      key={s._id}
                      className={`border-b ${
                        s.cancelled_at ? "opacity-50 line-through" : ""
                      }`}
                    >
                      <td className="p-2 text-xs text-gray-500">
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                      <td className="p-2">
                        <span className="text-xs px-1.5 py-0.5 rounded border bg-gray-100">
                          {t(`wms_scan.type_${s.type}` as any)}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {s.inbound_request_id ?? s.unclaimed_inbound_id ?? "—"}
                      </td>
                      <td className="p-2">{s.locationCode ?? "—"}</td>
                      <td className="p-2">{s.weight ?? "—"}</td>
                      <td className="p-2">{s.photo_paths.length}</td>
                      <td className="p-2">
                        {s.anomalies.length > 0 ? (
                          <span className="text-amber-700">
                            {s.anomalies.map((a) => a.code).join(", ")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {s.operator_staff_id.substring(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

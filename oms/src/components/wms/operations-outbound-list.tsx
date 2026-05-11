"use client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

interface OutboundRow {
  _id: string;
  client_id: string;
  warehouseCode: string;
  carrier_code: string;
  destination_country: string;
  status: string;
  shipment_type: string;
  inbound_count: number;
  declared_weight_kg: number | null;
  actual_weight_kg: number | null;
  tracking_no: string | null;
  createdAt: string;
}

const STATUS_FILTERS: { key: string; statuses: string[] }[] = [
  { key: "all", statuses: [] },
  {
    key: "in_progress",
    statuses: [
      "ready_for_label",
      "picking",
      "picked",
      "packing",
      "packed",
      "weighing",
      "weight_verified",
      "pending_client_label",
      "label_obtaining",
      "label_obtained",
      "label_printed",
    ],
  },
  { key: "held", statuses: ["held"] },
  { key: "departed", statuses: ["departed"] },
  { key: "cancelled", statuses: ["cancelled", "cancelled_after_label"] },
];

export const OperationsOutboundList = () => {
  const t = useTranslations();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<OutboundRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async (filterKey: string, queryStr: string) => {
    setLoading(true);
    const grp = STATUS_FILTERS.find((s) => s.key === filterKey);
    const params = new URLSearchParams();
    if (grp && grp.statuses.length > 0)
      params.set("status", grp.statuses.join(","));
    if (queryStr.trim()) params.set("q", queryStr.trim());
    params.set("limit", "100");
    const r = await http_request(
      "GET",
      `/api/wms/outbound/list?${params.toString()}`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) {
      setItems(d.data.items ?? []);
      setTotal(d.data.total ?? 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    load(filter, q);
  }, [filter]);

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={
                  "px-3 py-1 rounded-full text-sm border " +
                  (filter === f.key
                    ? "bg-black text-white border-black"
                    : "bg-white border-gray-300 hover:bg-gray-50")
                }
              >
                {t(`wms_ops.outbound_list.filter.${f.key}` as any)}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load(filter, q);
                }}
                placeholder={t("wms_ops.outbound_list.search_placeholder")}
                className="w-64"
              />
              <span className="text-xs text-gray-500">
                {t("wms_ops.outbound_list.total", { total })}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-center text-gray-500 py-12">
              {t("common.loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="text-center text-gray-500 py-12">
              {t("wms_ops.outbound_list.empty")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 border-b">
                <tr className="text-left">
                  <th className="py-2 pr-3">{t("wms_ops.outbound_list.col_id")}</th>
                  <th className="py-2 pr-3">{t("wms_ops.outbound_list.col_client")}</th>
                  <th className="py-2 pr-3">{t("wms_ops.outbound_list.col_status")}</th>
                  <th className="py-2 pr-3">{t("wms_ops.outbound_list.col_warehouse")}</th>
                  <th className="py-2 pr-3">{t("wms_ops.outbound_list.col_carrier")}</th>
                  <th className="py-2 pr-3">{t("wms_ops.outbound_list.col_dest")}</th>
                  <th className="py-2 pr-3 text-right">{t("wms_ops.outbound_list.col_inbounds")}</th>
                  <th className="py-2 pr-3 text-right">{t("wms_ops.outbound_list.col_weight")}</th>
                  <th className="py-2 pr-3">{t("wms_ops.outbound_list.col_tracking")}</th>
                  <th className="py-2 pr-3">{t("wms_ops.outbound_list.col_created")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o._id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-3 font-mono text-xs">
                      <Link
                        className="text-blue-700 hover:underline"
                        href={`/zh-hk/outbound/${o._id}`}
                      >
                        {o._id}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-gray-600">
                      {o.client_id}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                        {o.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs">{o.warehouseCode}</td>
                    <td className="py-2 pr-3 text-xs">{o.carrier_code}</td>
                    <td className="py-2 pr-3 text-xs">{o.destination_country}</td>
                    <td className="py-2 pr-3 text-right">{o.inbound_count}</td>
                    <td className="py-2 pr-3 text-right">
                      {o.actual_weight_kg ?? o.declared_weight_kg ?? "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {o.tracking_no ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-500">
                      {new Date(o.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

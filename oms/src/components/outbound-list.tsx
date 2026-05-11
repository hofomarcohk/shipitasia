"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { http_request } from "@/lib/httpRequest";
import { IconTruck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Outbound {
  _id: string;
  warehouseCode: string;
  shipment_type: "consolidated" | "single";
  inbound_count: number;
  carrier_code: string;
  destination_country: string;
  status: string;
  held_reason: string | null;
  quoted_amount_hkd: number | null;
  tracking_no: string | null;
  createdAt: string;
}

const STATUS_GROUPS = {
  active: [
    "held",
    "ready_for_label",
    "picking",
    "packed",
    "weight_verified",
    "pending_client_label",
    "label_obtaining",
    "label_obtained",
  ],
  completed: ["departed"],
  cancelled: ["cancelled"],
} as const;

const STATUS_CLS: Record<string, string> = {
  held: "bg-amber-50 text-amber-700 border-amber-200",
  ready_for_label: "bg-blue-50 text-blue-700 border-blue-200",
  picking: "bg-purple-50 text-purple-700 border-purple-200",
  packed: "bg-purple-50 text-purple-700 border-purple-200",
  weight_verified: "bg-purple-50 text-purple-700 border-purple-200",
  pending_client_label: "bg-cyan-50 text-cyan-700 border-cyan-200",
  label_obtaining: "bg-indigo-50 text-indigo-700 border-indigo-200",
  label_obtained: "bg-emerald-50 text-emerald-700 border-emerald-200",
  departed: "bg-gray-100 text-gray-700 border-gray-300",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
};

export const OutboundList = () => {
  const t = useTranslations();
  const [tab, setTab] = useState<keyof typeof STATUS_GROUPS>("active");
  const [items, setItems] = useState<Outbound[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const statuses = STATUS_GROUPS[tab].join(",");
    const res = await http_request("GET", "/api/cms/outbound", {
      status: statuses,
      limit: 200,
    });
    const data = await res.json();
    if (data.status === 200) setItems(data.data.items);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tab]);

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <IconTruck size={28} />
            {t("outbound_v1.page_title")}
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            {t("outbound_v1.page_subtitle")}
          </p>
        </div>
        <Link href="/zh-hk/outbound/new">
          <Button>{t("outbound_v1.new_btn")}</Button>
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="active">{t("outbound_v1.tab_active")}</TabsTrigger>
          <TabsTrigger value="completed">
            {t("outbound_v1.tab_completed")}
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            {t("outbound_v1.tab_cancelled")}
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
            <div className="flex flex-col items-center py-16 text-center">
              <IconTruck size={48} className="text-gray-300 mb-3" />
              <p className="text-gray-600 mb-4">{t("outbound_v1.empty")}</p>
              {tab === "active" && (
                <Link href="/zh-hk/outbound/new">
                  <Button>{t("outbound_v1.empty_cta")}</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b bg-gray-50">
                    <th className="py-3 px-3">{t("outbound_v1.list.id")}</th>
                    <th className="py-3 px-3">{t("outbound_v1.list.shipment_type")}</th>
                    <th className="py-3 px-3 text-right">
                      {t("outbound_v1.list.inbound_count")}
                    </th>
                    <th className="py-3 px-3">{t("outbound_v1.list.carrier")}</th>
                    <th className="py-3 px-3">{t("outbound_v1.list.country")}</th>
                    <th className="py-3 px-3 text-right">
                      {t("outbound_v1.list.quoted_amount")}
                    </th>
                    <th className="py-3 px-3">{t("outbound_v1.list.status")}</th>
                    <th className="py-3 px-3">{t("outbound_v1.list.tracking_no")}</th>
                    <th className="py-3 px-3">{t("outbound_v1.list.created_at")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((o) => (
                    <tr key={o._id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-3 font-mono text-xs">
                        <Link
                          href={`/zh-hk/outbound/${o._id}`}
                          className="text-blue-600 underline"
                        >
                          {o._id}
                        </Link>
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant={
                            o.shipment_type === "single" ? "default" : "secondary"
                          }
                        >
                          {t(`outbound_v1.shipment_type.${o.shipment_type}` as any)}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right">{o.inbound_count}</td>
                      <td className="py-3 px-3">{o.carrier_code}</td>
                      <td className="py-3 px-3">{o.destination_country}</td>
                      <td className="py-3 px-3 text-right">
                        {o.quoted_amount_hkd
                          ? `HK$${o.quoted_amount_hkd.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border text-xs ${
                            STATUS_CLS[o.status] ?? "bg-gray-50 border-gray-200"
                          }`}
                        >
                          {t(`outbound_v1.status.${o.status}` as any)}
                          {o.held_reason ? ` · ${o.held_reason}` : ""}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">
                        {o.tracking_no ?? "—"}
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-500">
                        {new Date(o.createdAt).toLocaleString()}
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

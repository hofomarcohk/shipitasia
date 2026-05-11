"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { http_request } from "@/lib/httpRequest";
import { IconPackage } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Inbound {
  _id: string;
  warehouseCode: string;
  carrier_inbound_code: string;
  tracking_no: string;
  inbound_source: string;
  shipment_type: string;
  declared_items_count: number;
  declared_value_total: number;
  declared_currency: string;
  status: string;
  createdAt: string;
}

const STATUS_GROUPS = {
  active: ["pending", "arrived", "received", "picking", "packed", "palletized"],
  completed: ["departed"],
  cancelled: ["cancelled", "abandoned", "expired"],
} as const;

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  arrived: "bg-blue-50 text-blue-700 border-blue-200",
  received: "bg-green-50 text-green-700 border-green-200",
  picking: "bg-purple-50 text-purple-700 border-purple-200",
  packed: "bg-purple-50 text-purple-700 border-purple-200",
  palletized: "bg-purple-50 text-purple-700 border-purple-200",
  departed: "bg-gray-100 text-gray-700 border-gray-300",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  abandoned: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-gray-50 text-gray-500 border-gray-200",
};

export const InboundList = () => {
  const t = useTranslations();
  const [tab, setTab] = useState<keyof typeof STATUS_GROUPS>("active");
  const [items, setItems] = useState<Inbound[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const statuses = STATUS_GROUPS[tab].join(",");
    const res = await http_request("GET", "/api/cms/inbound", {
      status: statuses,
      page_size: 200,
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
            <IconPackage size={28} />
            {t("inbound_v1.page_title")}
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            {t("inbound_v1.page_subtitle")}
          </p>
        </div>
        <Link href="/zh-hk/inbound/new">
          <Button>{t("inbound_v1.new_btn")}</Button>
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="active">{t("inbound_v1.tab_active")}</TabsTrigger>
          <TabsTrigger value="completed">
            {t("inbound_v1.tab_completed")}
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            {t("inbound_v1.tab_cancelled")}
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
              <IconPackage size={48} className="text-gray-300 mb-3" />
              <p className="text-gray-600 mb-4">{t("inbound_v1.empty")}</p>
              {tab === "active" && (
                <Link href="/zh-hk/inbound/new">
                  <Button>{t("inbound_v1.empty_cta")}</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b bg-gray-50">
                    <th className="py-3 px-3">{t("inbound_v1.list.id")}</th>
                    <th className="py-3 px-3">{t("inbound_v1.list.carrier")}</th>
                    <th className="py-3 px-3">
                      {t("inbound_v1.list.tracking_no")}
                    </th>
                    <th className="py-3 px-3">
                      {t("inbound_v1.list.shipment_type")}
                    </th>
                    <th className="py-3 px-3 text-right">
                      {t("inbound_v1.list.items_count")}
                    </th>
                    <th className="py-3 px-3 text-right">
                      {t("inbound_v1.list.declared_value")}
                    </th>
                    <th className="py-3 px-3">{t("inbound_v1.list.status")}</th>
                    <th className="py-3 px-3">
                      {t("inbound_v1.list.created_at")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i._id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-3 font-mono text-xs">
                        <Link
                          href={`/zh-hk/inbound/${i._id}`}
                          className="text-blue-600 underline"
                        >
                          {i._id}
                        </Link>
                      </td>
                      <td className="py-3 px-3">{i.carrier_inbound_code}</td>
                      <td className="py-3 px-3 font-mono text-xs">
                        {i.tracking_no}
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant={
                            i.shipment_type === "single" ? "default" : "secondary"
                          }
                        >
                          {t(`inbound_v1.shipment_type.${i.shipment_type}` as any)}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {i.declared_items_count}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {i.declared_currency} {i.declared_value_total.toLocaleString()}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border text-xs ${
                            STATUS_CLS[i.status] ?? "bg-gray-50 border-gray-200"
                          }`}
                        >
                          {t(`inbound_v1.status.${i.status}` as any)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-500">
                        {new Date(i.createdAt).toLocaleString()}
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

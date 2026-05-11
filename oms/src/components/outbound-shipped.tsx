"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { http_request } from "@/lib/httpRequest";
import {
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconExternalLink,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface ShippedItem {
  _id: string;
  createdAt: string;
  departed_at: string | null;
  customer_remarks: string | null;
  carrier: {
    carrier_code: string;
    name_zh: string;
    name_en: string;
    logo_url: string | null;
    tracking_url_template: string | null;
  };
  service_code: string | null;
  sender: {
    contact_name: string | null;
    phone: string | null;
    address: string;
    country_code: string;
  };
  receiver: {
    name: string;
    phone: string;
    country_code: string;
    city: string;
    address: string;
    postal_code: string | null;
  };
  total_boxes: number;
  total_inbound_count: number;
  tracking_summary: {
    primary_tracking_no: string | null;
    additional_count: number;
  };
  actual_label_fee: number | null;
  first_box_preview: {
    box_no: string;
    dimensions: { length: number; width: number; height: number };
    weight_actual: number | null;
    first_item_name: string | null;
  } | null;
}

interface DetailBox {
  _id: string;
  box_no: string;
  dimensions: { length: number; width: number; height: number };
  weight_actual: number | null;
  tracking_no_carrier: string | null;
  inbound_items: Array<{
    inbound_id: string;
    tracking_no: string;
    declared_items: Array<{
      product_name: string;
      quantity: number;
      unit_price: number;
      currency: string;
      subtotal: number;
    }>;
  }>;
}

interface Detail extends ShippedItem {
  boxes: DetailBox[];
}

export const OutboundShipped = () => {
  const t = useTranslations();
  const [items, setItems] = useState<ShippedItem[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    page_size: 10,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = async (page = 1) => {
    setLoading(true);
    const q: any = { page, page_size: pagination.page_size };
    if (debounced && debounced.length >= 2) q.search = debounced;
    const r = await http_request("GET", "/api/cms/outbound/shipped", q);
    const d = await r.json();
    if (d.status === 200) {
      setItems(d.data.items);
      setPagination(d.data.pagination);
    }
    setLoading(false);
  };

  useEffect(() => {
    load(1);
  }, [debounced]);

  const toggleDetail = async (id: string) => {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    if (!details[id]) {
      const r = await http_request(
        "GET",
        `/api/cms/outbound/${id}/shipped-detail`,
        {}
      );
      const d = await r.json();
      if (d.status === 200) setDetails((p) => ({ ...p, [id]: d.data }));
    }
  };

  const copyTracking = async (tracking: string) => {
    try {
      await navigator.clipboard.writeText(tracking);
      setCopied(tracking);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt(t("outbound_v1.shipped.copy_fallback"), tracking);
    }
  };

  const trackingUrl = (
    template: string | null,
    tracking: string | null
  ): string | null => {
    if (!template || !tracking) return null;
    return template.replace("{tracking_no}", encodeURIComponent(tracking));
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <IconTruckDelivery size={28} />
            {t("outbound_v1.shipped.page_title")}
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            {t("outbound_v1.shipped.total", { count: pagination.total })}
          </p>
        </div>
        <Button variant="outline" onClick={() => load(pagination.page)}>
          {t("outbound_v1.shipped.refresh")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-3">
          <Input
            placeholder={t("outbound_v1.shipped.search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-center text-gray-500 py-12">
          {t("common.loading")}
        </p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <IconTruckDelivery size={48} className="text-gray-300 mb-3" />
            <p className="text-gray-600 mb-4">
              {debounced
                ? t("outbound_v1.shipped.no_results")
                : t("outbound_v1.shipped.empty")}
            </p>
            {!debounced && (
              <Link href="/zh-hk/outbound/new">
                <Button>{t("outbound_v1.shipped.empty_cta")}</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        items.map((o) => {
          const isOpen = open === o._id;
          const detail = details[o._id];
          const primaryUrl = trackingUrl(
            o.carrier.tracking_url_template,
            o.tracking_summary.primary_tracking_no
          );
          return (
            <Card key={o._id}>
              <CardContent className="p-0">
                <div
                  className="grid grid-cols-12 gap-3 p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleDetail(o._id)}
                >
                  {/* ID + time */}
                  <div className="col-span-2">
                    <div className="font-mono text-sm">{o._id}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(o.createdAt).toLocaleString()}
                    </div>
                    {o.customer_remarks && (
                      <div
                        className="text-xs text-gray-500 mt-1 truncate"
                        title={o.customer_remarks}
                      >
                        {o.customer_remarks}
                      </div>
                    )}
                  </div>
                  {/* Carrier + tracking */}
                  <div className="col-span-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary">
                        {t("outbound_v1.shipped.intl_badge")}
                      </Badge>
                      <span className="font-medium">
                        {o.carrier.name_zh}
                        {o.service_code ? ` (${o.service_code})` : ""}
                      </span>
                    </div>
                    {o.tracking_summary.primary_tracking_no && (
                      <div className="flex items-center gap-1 mt-1 text-xs">
                        <span className="font-mono">
                          {o.tracking_summary.primary_tracking_no}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyTracking(
                              o.tracking_summary.primary_tracking_no!
                            );
                          }}
                          className="text-gray-500 hover:text-gray-800"
                          title={t("outbound_v1.shipped.copy")}
                        >
                          <IconCopy size={14} />
                        </button>
                        {primaryUrl ? (
                          <a
                            href={primaryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:underline"
                            title={t("outbound_v1.shipped.track_link")}
                          >
                            <IconExternalLink size={14} />
                          </a>
                        ) : (
                          <span
                            className="text-gray-300"
                            title={t("outbound_v1.shipped.no_track_url")}
                          >
                            <IconExternalLink size={14} />
                          </span>
                        )}
                        {o.tracking_summary.additional_count > 0 && (
                          <span className="text-gray-500 ml-1">
                            (+{o.tracking_summary.additional_count})
                          </span>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {t("outbound_v1.shipped.label_fee")}: HK$
                      {o.actual_label_fee ?? 0}
                    </div>
                  </div>
                  {/* Receiver */}
                  <div className="col-span-3 text-sm">
                    <div className="font-medium">{o.receiver.name}</div>
                    <div className="text-xs text-gray-500">{o.receiver.phone}</div>
                    <div
                      className="text-xs text-gray-500 truncate"
                      title={o.receiver.address}
                    >
                      {o.receiver.city} · {o.receiver.country_code}
                    </div>
                  </div>
                  {/* Package summary */}
                  <div className="col-span-2 text-sm">
                    {o.first_box_preview ? (
                      <>
                        <div className="text-xs">
                          {o.first_box_preview.dimensions.length}×
                          {o.first_box_preview.dimensions.width}×
                          {o.first_box_preview.dimensions.height} cm
                          {o.first_box_preview.weight_actual
                            ? `, ${o.first_box_preview.weight_actual}kg`
                            : ""}
                        </div>
                        {o.first_box_preview.first_item_name && (
                          <div className="text-xs text-gray-500 truncate">
                            ・{o.first_box_preview.first_item_name}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-gray-400">—</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {o.total_boxes} 箱 / {o.total_inbound_count} 件
                    </div>
                  </div>
                  {/* Expand */}
                  <div className="col-span-1 flex items-start justify-end">
                    {isOpen ? (
                      <IconChevronUp size={18} />
                    ) : (
                      <IconChevronDown size={18} />
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t bg-gray-50 p-4 grid gap-3">
                    {!detail ? (
                      <p className="text-gray-500 text-sm">
                        {t("common.loading")}
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <div>
                            <span className="text-gray-500">
                              {t("outbound_v1.shipped.detail.departed_at")}:
                            </span>{" "}
                            {detail.departed_at
                              ? new Date(detail.departed_at).toLocaleString()
                              : "—"}
                          </div>
                          <div>
                            <span className="text-gray-500">
                              {t("outbound_v1.shipped.detail.sender")}:
                            </span>{" "}
                            {detail.sender.contact_name ?? "—"}
                          </div>
                          <div className="col-span-2 text-xs text-gray-500">
                            {detail.sender.address}
                          </div>
                          <div className="col-span-2">
                            <span className="text-gray-500">
                              {t("outbound_v1.shipped.detail.receiver_full")}:
                            </span>{" "}
                            {detail.receiver.address}
                          </div>
                        </div>

                        <div className="grid gap-2">
                          {detail.boxes.map((b) => {
                            const url = trackingUrl(
                              detail.carrier.tracking_url_template,
                              b.tracking_no_carrier
                            );
                            return (
                              <div
                                key={b._id}
                                className="bg-white border rounded p-3"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="font-medium text-sm">
                                    {t("outbound_v1.shipped.detail.box")} {b.box_no}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {b.dimensions.length}×{b.dimensions.width}×
                                    {b.dimensions.height} cm
                                    {b.weight_actual
                                      ? ` · ${b.weight_actual}kg`
                                      : ""}
                                  </div>
                                </div>
                                {b.tracking_no_carrier ? (
                                  <div className="flex items-center gap-1 mt-1 text-xs">
                                    <span className="font-mono">
                                      {b.tracking_no_carrier}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyTracking(b.tracking_no_carrier!);
                                      }}
                                      className="text-gray-500 hover:text-gray-800"
                                    >
                                      <IconCopy size={13} />
                                    </button>
                                    {url ? (
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline"
                                      >
                                        <IconExternalLink size={13} />
                                      </a>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="text-xs text-amber-700 mt-1">
                                    ⚠ {t("outbound_v1.shipped.detail.no_tracking")}
                                  </div>
                                )}
                                <div className="mt-2 pl-3 border-l text-xs space-y-1">
                                  {b.inbound_items.map((ii) => (
                                    <div key={ii.inbound_id}>
                                      <div className="font-mono text-gray-600">
                                        {ii.inbound_id} · {ii.tracking_no}
                                      </div>
                                      <ul className="pl-3 list-disc text-gray-500">
                                        {ii.declared_items.map((it, idx) => (
                                          <li key={idx}>
                                            {it.product_name} × {it.quantity} (
                                            {it.currency} {it.unit_price})
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {pagination.total_pages > 1 && (
        <div className="flex justify-center gap-2 pt-3">
          <Button
            variant="outline"
            disabled={pagination.page <= 1}
            onClick={() => load(pagination.page - 1)}
          >
            ←
          </Button>
          <span className="text-sm self-center">
            {pagination.page} / {pagination.total_pages}
          </span>
          <Button
            variant="outline"
            disabled={pagination.page >= pagination.total_pages}
            onClick={() => load(pagination.page + 1)}
          >
            →
          </Button>
        </div>
      )}

      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white text-xs rounded px-3 py-2 shadow">
          {t("outbound_v1.shipped.copied")}: {copied}
        </div>
      )}
    </div>
  );
};

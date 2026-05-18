"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface OutboundRow {
  _id: string;
  carrier_code: string;
  destination_country: string;
  inbound_count: number;
  status: "pending_client_label" | "label_obtained" | "label_printed" | string;
  shipment_type?: "consolidated" | "single" | string;
  label_batch_id?: string | null;
  client_code?: string | null;
  client_display_name?: string | null;
  client_email?: string | null;
  box_count?: number;
  contains_battery?: boolean;
  contains_liquid?: boolean;
  notified_count?: number;
  last_notified_at?: string | null;
}

interface DetailItem {
  inbound_id: string;
  tracking_no: string | null;
  actual_weight: number | null;
  carrier_inbound_code: string | null;
}
interface DetailBox {
  box_no: string;
  width: number;
  length: number;
  height: number;
  weight: number;
  sealed_at: string | null;
  label_pdf_path: string | null;
  tracking_no_carrier: string | null;
  items: DetailItem[];
}
interface OutboundDetail {
  outbound_id: string;
  status: string;
  carrier_code: string;
  destination_country: string;
  inbound_count: number;
  box_count: number;
  boxes: DetailBox[];
}

export const OperationsLabelPrint = () => {
  const t = useTranslations();
  const [list, setList] = useState<OutboundRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OutboundDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  const [palletInput, setPalletInput] = useState("");
  const [palletFlash, setPalletFlash] = useState("");
  const palletRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    const r = await http_request(
      "GET",
      "/api/wms/outbound/label-printable",
      {}
    );
    const d = await r.json();
    if (d.status === 200) setList(d.data ?? []);
  };

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    setOpenId(id);
    setDetail(null);
    try {
      const r = await http_request(
        "GET",
        `/api/wms/outbound/${id}/label-print-detail`,
        {}
      );
      const d = await r.json();
      if (d.status === 200) setDetail(d.data);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleDetail = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
    } else {
      loadDetail(id);
    }
  };

  const scanPallet = async () => {
    if (!palletInput.trim()) return;
    setError("");
    setPalletFlash("");
    const r = await http_request("POST", "/api/wms/pallet-label/scan-back", {
      pallet_no: palletInput.trim(),
    });
    const d = await r.json();
    if (d.status === 200) {
      const oid = d.data.outbound_id;
      const status = d.data.outbound_status;
      if (!["label_obtained", "pending_client_label"].includes(status)) {
        setError(t("wms_ops.label_print.pallet_wrong_status", { status }));
      } else {
        setPalletFlash(t("wms_ops.label_print.pallet_loaded", { oid }));
        await loadDetail(oid);
        setPalletInput("");
      }
    } else {
      setError(d.message ?? "scan failed");
    }
  };

  useEffect(() => {
    reload();
    palletRef.current?.focus();
  }, []);

  const printAll = (urls: (string | null)[]) => {
    for (const u of urls) {
      if (u) window.open(u, "_blank");
    }
  };
  const complete = async (id: string) => {
    setError("");
    const r = await http_request(
      "POST",
      `/api/wms/outbound/${id}/label-print-complete`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) {
      setFlash(`${id} ${t("wms_ops.label_print.done")}`);
      await reload();
      setOpenId(null);
      setDetail(null);
    } else {
      setError(d.message ?? "fail");
    }
  };

  const notifyClient = async (id: string) => {
    setError("");
    setFlash("");
    setNotifyingId(id);
    try {
      const r = await http_request(
        "POST",
        `/api/wms/outbound/${id}/notify-client-label`,
        {}
      );
      const d = await r.json();
      if (d.status === 200) {
        setFlash(t("wms_ops.label_print.notify_success", { oid: id }));
        await reload();
      } else {
        setError(d.message ?? "fail");
      }
    } finally {
      setNotifyingId(null);
    }
  };

  const formatNotifiedAt = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleString("zh-HK", { hour12: false });
  };

  const clientLabel = (o: OutboundRow) => {
    const code = o.client_code ?? "—";
    const name = o.client_display_name ?? o.client_email ?? "";
    return name ? `${code} · ${name}` : code;
  };

  const headerLine = (o: OutboundRow) => (
    <div className="flex flex-col gap-1">
      <div className="font-semibold flex items-center gap-2 flex-wrap">
        <span className="font-mono">{o._id}</span>
        <Badge variant={o.shipment_type === "single" ? "default" : "outline"}>
          {o.shipment_type === "single"
            ? t("wms_ops.label_print.chip_single")
            : t("wms_ops.label_print.chip_consolidated")}
        </Badge>
        {o.contains_battery && (
          <Badge variant="destructive">
            {t("wms_ops.label_print.chip_battery")}
          </Badge>
        )}
        {o.contains_liquid && (
          <Badge variant="destructive">
            {t("wms_ops.label_print.chip_liquid")}
          </Badge>
        )}
        {o.status === "label_printed" && (
          <Badge variant="secondary">
            {t("wms_ops.label_print.chip_label_printed")}
          </Badge>
        )}
        {o.label_batch_id && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {o.label_batch_id}
          </Badge>
        )}
      </div>
      <div className="text-xs text-gray-600">
        {clientLabel(o)} · {o.carrier_code} → {o.destination_country} ·{" "}
        {t("wms_ops.label_print.box_count", { n: o.box_count ?? 0 })} ·{" "}
        {t("wms_ops.label_print.inbound_count", { n: o.inbound_count })}
      </div>
    </div>
  );

  const detailPanel = (o: OutboundRow) => {
    if (detailLoading) {
      return (
        <CardContent>
          <div className="text-sm text-gray-500">
            {t("wms_ops.label_print.detail_loading")}
          </div>
        </CardContent>
      );
    }
    if (!detail) return null;
    const allUrls = detail.boxes.map((b) => b.label_pdf_path);
    const hasAnyLabel = allUrls.some(Boolean);
    return (
      <CardContent>
        <div className="grid gap-3 text-sm">
          {detail.boxes.length === 0 ? (
            <div className="text-gray-500">
              {t("wms_ops.label_print.detail_no_boxes")}
            </div>
          ) : (
            detail.boxes.map((b) => (
              <div key={b.box_no} className="border rounded">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b">
                  <div className="flex flex-col">
                    <div className="font-mono font-semibold text-sm">
                      {b.box_no}
                    </div>
                    <div className="text-xs text-gray-500">
                      {b.length}×{b.width}×{b.height} cm · {b.weight} kg
                      {b.tracking_no_carrier && (
                        <>
                          {" · "}
                          <span className="font-mono">
                            {b.tracking_no_carrier}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {b.label_pdf_path && (
                    <a
                      href={b.label_pdf_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline text-xs"
                    >
                      {t("wms_ops.label_print.preview_pdf")}
                    </a>
                  )}
                </div>
                <div className="divide-y">
                  {b.items.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-500">
                      {t("wms_ops.label_print.detail_no_items")}
                    </div>
                  ) : (
                    b.items.map((it) => (
                      <div
                        key={it.inbound_id}
                        className="px-3 py-2 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-mono">
                            {it.tracking_no ?? it.inbound_id}
                          </div>
                          <div className="text-gray-500">
                            {it.carrier_inbound_code ?? "—"}
                          </div>
                        </div>
                        <div className="text-gray-600">
                          {it.actual_weight != null
                            ? `${it.actual_weight} kg`
                            : "—"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {o.status !== "pending_client_label" && (
          <div className="flex flex-wrap justify-end gap-2 pt-3">
            <Button
              variant="outline"
              onClick={() =>
                window.open(`/zh-hk/wms/print/invoice/${o._id}`, "_blank")
              }
            >
              {t("wms_ops.label_print.print_invoice")}
            </Button>
            <Button
              variant="outline"
              disabled={!hasAnyLabel}
              onClick={() => printAll(allUrls)}
            >
              {t("wms_ops.label_print.print_all")}
            </Button>
            <Button
              onClick={() => complete(o._id)}
              disabled={o.status === "label_printed"}
            >
              {o.status === "label_printed"
                ? t("wms_ops.label_print.complete_done")
                : t("wms_ops.label_print.complete")}
            </Button>
          </div>
        )}
      </CardContent>
    );
  };

  const pending = list.filter((o) => o.status === "pending_client_label");
  const ready = list.filter((o) =>
    ["label_obtained", "label_printed"].includes(o.status)
  );
  const readyHasActionable = ready.some((o) => o.status === "label_obtained");

  const pendingSection = (
    <section key="pending" className="grid gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-semibold">
          {t("wms_ops.label_print.group_pending_title")}
        </h2>
        <span className="text-sm text-gray-500">
          {t("wms_ops.label_print.group_count", { n: pending.length })}
        </span>
      </div>
      <p className="text-xs text-gray-500 -mt-1">
        {t("wms_ops.label_print.group_pending_hint")}
      </p>
      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500 text-sm">
            {t("wms_ops.label_print.group_pending_empty")}
          </CardContent>
        </Card>
      ) : (
        pending.map((o) => (
          <Card key={o._id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                {headerLine(o)}
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    onClick={() => toggleDetail(o._id)}
                  >
                    {openId === o._id
                      ? t("wms_ops.label_print.collapse")
                      : t("wms_ops.label_print.view_detail")}
                  </Button>
                  <Button
                    variant={
                      o.notified_count && o.notified_count > 0
                        ? "outline"
                        : "default"
                    }
                    onClick={() => notifyClient(o._id)}
                    disabled={notifyingId === o._id}
                  >
                    {o.notified_count && o.notified_count > 0
                      ? t("wms_ops.label_print.notify_again_btn")
                      : t("wms_ops.label_print.notify_btn")}
                  </Button>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {o.notified_count && o.notified_count > 0
                  ? t("wms_ops.label_print.notified_meta", {
                      n: o.notified_count,
                      at: formatNotifiedAt(o.last_notified_at) ?? "—",
                    })
                  : t("wms_ops.label_print.not_yet_notified")}
              </div>
            </CardHeader>
            {openId === o._id && detailPanel(o)}
          </Card>
        ))
      )}
    </section>
  );

  const readySection = (
    <section key="ready" className="grid gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-semibold">
          {t("wms_ops.label_print.group_ready_title")}
        </h2>
        <span className="text-sm text-gray-500">
          {t("wms_ops.label_print.group_count", { n: ready.length })}
        </span>
      </div>
      {ready.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500 text-sm">
            {t("wms_ops.label_print.group_ready_empty")}
          </CardContent>
        </Card>
      ) : (
        ready.map((o) => (
          <Card key={o._id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                {headerLine(o)}
                <Button
                  variant="outline"
                  onClick={() => toggleDetail(o._id)}
                  className="shrink-0"
                >
                  {openId === o._id
                    ? t("wms_ops.label_print.collapse")
                    : t("wms_ops.label_print.view_detail")}
                </Button>
              </div>
            </CardHeader>
            {openId === o._id && detailPanel(o)}
          </Card>
        ))
      )}
    </section>
  );

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 grid gap-6">
      <Card>
        <CardContent className="py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              scanPallet();
            }}
            className="flex gap-2 items-end"
          >
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">
                {t("wms_ops.label_print.scan_pallet_label")}
              </div>
              <Input
                ref={palletRef}
                value={palletInput}
                onChange={(e) => setPalletInput(e.target.value)}
                placeholder={t("wms_ops.label_print.scan_pallet_placeholder")}
                autoComplete="off"
              />
            </div>
            <Button type="submit">
              {t("wms_ops.label_print.scan_pallet_btn")}
            </Button>
          </form>
          {palletFlash && (
            <p className="text-xs text-emerald-700 mt-2">{palletFlash}</p>
          )}
        </CardContent>
      </Card>

      {readyHasActionable
        ? [readySection, pendingSection]
        : [pendingSection, readySection]}

      {flash && <p className="text-sm text-emerald-700">{flash}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

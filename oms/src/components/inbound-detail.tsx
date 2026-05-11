"use client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface DeclaredItem {
  _id: string;
  category_id: string;
  subcategory_id: string;
  product_name: string;
  product_url: string | null;
  quantity: number;
  unit_price: number;
  currency: string;
  subtotal: number;
}

interface Inbound {
  _id: string;
  warehouseCode: string;
  carrier_inbound_code: string;
  tracking_no: string;
  tracking_no_other: string | null;
  inbound_source: string;
  size_estimate: string;
  contains_liquid: boolean;
  contains_battery: boolean;
  shipment_type: string;
  single_shipping: any;
  customer_remarks: string | null;
  declared_value_total: number;
  declared_currency: string;
  declared_items_count: number;
  status: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  abandoned_at: string | null;
  abandoned_reason: string | null;
  arrivedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}

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

export const InboundDetail = ({ id }: { id: string }) => {
  const t = useTranslations();
  const router = useRouter();
  const [inb, setInb] = useState<Inbound | null>(null);
  const [items, setItems] = useState<DeclaredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [abandonAck, setAbandonAck] = useState(false);
  const [abandonType, setAbandonType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await http_request("GET", `/api/cms/inbound/${id}`, {});
    const d = await res.json();
    if (d.status === 200) {
      setInb(d.data.inbound);
      setItems(d.data.declared_items);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const doCancel = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await http_request(
        "POST",
        `/api/cms/inbound/${id}/cancel`,
        { cancel_reason: cancelReason || undefined }
      );
      const d = await res.json();
      if (res.ok && d.status === 200) {
        setCancelOpen(false);
        load();
      } else {
        setError(d.message || "Failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const doAbandon = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await http_request(
        "POST",
        `/api/cms/inbound/${id}/abandon`,
        { confirmation_text: abandonType }
      );
      const d = await res.json();
      if (res.ok && d.status === 200) {
        setAbandonOpen(false);
        load();
      } else {
        setError(d.message || "Failed");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">{t("common.loading")}</div>;
  }
  if (!inb) {
    return (
      <div className="text-center py-12 text-red-500">
        Not found
      </div>
    );
  }

  const canEdit = inb.status === "pending";
  const canCancel = inb.status === "pending";
  const canAbandon = inb.status === "arrived" || inb.status === "received";

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold font-mono">{inb._id}</h1>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block px-2 py-0.5 rounded border text-xs ${
                STATUS_CLS[inb.status] ?? "bg-gray-50"
              }`}
            >
              {t(`inbound_v1.status.${inb.status}` as any)}
            </span>
            <span className="text-sm text-gray-500">
              {t(`inbound_v1.shipment_type.${inb.shipment_type}` as any)}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Link href={`/zh-hk/inbound/${id}/edit`}>
              <Button variant="outline">
                {t("inbound_v1.actions.edit")}
              </Button>
            </Link>
          )}
          {canCancel && (
            <Button
              variant="outline"
              className="text-red-600"
              onClick={() => setCancelOpen(true)}
            >
              {t("inbound_v1.actions.cancel")}
            </Button>
          )}
          {canAbandon && (
            <Button
              variant="outline"
              className="text-red-600 border-red-600"
              onClick={() => setAbandonOpen(true)}
            >
              {t("inbound_v1.actions.abandon")}
            </Button>
          )}
          <Link href="/zh-hk/inbound/list">
            <Button variant="ghost">{t("inbound_v1.new.back")}</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">{t("inbound_v1.detail.warehouse_section")}</h2>
        </CardHeader>
        <CardContent>
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            <Row label={t("inbound_v1.list.warehouse")}>{inb.warehouseCode}</Row>
            <Row label={t("inbound_v1.list.carrier")}>
              {inb.carrier_inbound_code}
              {inb.tracking_no_other && ` (${inb.tracking_no_other})`}
            </Row>
            <Row label={t("inbound_v1.list.tracking_no")}>
              <span className="font-mono">{inb.tracking_no}</span>
            </Row>
            <Row label={t("inbound_v1.list.source")}>
              {t(`inbound_v1.inbound_source.${inb.inbound_source}` as any)}
            </Row>
            <Row label={t("inbound_v1.new.size_estimate_label")}>
              {t(`inbound_v1.size_estimate.${inb.size_estimate}` as any)}
            </Row>
            <Row label={t("inbound_v1.new.contains_liquid_label")}>
              {inb.contains_liquid
                ? t("inbound_v1.new.yes")
                : t("inbound_v1.new.no")}
              {" · "}
              {t("inbound_v1.new.contains_battery_label")}{" "}
              {inb.contains_battery
                ? t("inbound_v1.new.yes")
                : t("inbound_v1.new.no")}
            </Row>
            {inb.customer_remarks && (
              <Row label={t("inbound_v1.new.customer_remarks_label")} span2>
                {inb.customer_remarks}
              </Row>
            )}
          </dl>
        </CardContent>
      </Card>

      {inb.single_shipping && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">
              {t("inbound_v1.detail.single_shipping_section")}
            </h2>
          </CardHeader>
          <CardContent>
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              <Row label="Recipient">
                {inb.single_shipping.receiver_address.name}
                {" · "}
                {inb.single_shipping.receiver_address.phone}
              </Row>
              <Row label="Carrier account">
                {inb.single_shipping.carrier_account_id}
              </Row>
              <Row label="Address" span2>
                {[
                  inb.single_shipping.receiver_address.address,
                  inb.single_shipping.receiver_address.city,
                  inb.single_shipping.receiver_address.country_code,
                  inb.single_shipping.receiver_address.postal_code,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </Row>
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold">
            {t("inbound_v1.detail.items_section")} ({inb.declared_items_count})
          </h2>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">Unit price</th>
                <th className="py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it._id} className="border-b">
                  <td className="py-3 pr-3">
                    <div>{it.product_name}</div>
                    {it.product_url && (
                      <a
                        href={it.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 underline"
                      >
                        link
                      </a>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-xs text-gray-500">
                    {it.category_id} › {it.subcategory_id}
                  </td>
                  <td className="py-3 pr-3 text-right">{it.quantity}</td>
                  <td className="py-3 pr-3 text-right">
                    {it.currency} {it.unit_price.toLocaleString()}
                  </td>
                  <td className="py-3 text-right font-semibold">
                    {it.currency} {it.subtotal.toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="py-3 text-right font-semibold">
                  Total
                </td>
                <td className="py-3 text-right font-bold text-lg">
                  {inb.declared_currency} {inb.declared_value_total.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">
            {t("inbound_v1.detail.status_history_section")}
          </h2>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Created">
              {new Date(inb.createdAt).toLocaleString()}
            </Row>
            {inb.arrivedAt && (
              <Row label="Arrived">
                {new Date(inb.arrivedAt).toLocaleString()}
              </Row>
            )}
            {inb.receivedAt && (
              <Row label="Received">
                {new Date(inb.receivedAt).toLocaleString()}
              </Row>
            )}
            {inb.cancelled_at && (
              <Row label="Cancelled">
                {new Date(inb.cancelled_at).toLocaleString()}
                {inb.cancel_reason && ` — ${inb.cancel_reason}`}
              </Row>
            )}
            {inb.abandoned_at && (
              <Row label="Abandoned">
                {new Date(inb.abandoned_at).toLocaleString()}
                {inb.abandoned_reason && ` — ${inb.abandoned_reason}`}
              </Row>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inbound_v1.cancel_dialog.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {t("inbound_v1.cancel_dialog.body")}
          </p>
          <Label>{t("inbound_v1.cancel_dialog.reason_label")}</Label>
          <select
            className="border rounded px-3 py-2"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          >
            <option value="">--</option>
            <option value={t("inbound_v1.cancel_dialog.reason_seller")}>
              {t("inbound_v1.cancel_dialog.reason_seller")}
            </option>
            <option value={t("inbound_v1.cancel_dialog.reason_duplicate")}>
              {t("inbound_v1.cancel_dialog.reason_duplicate")}
            </option>
            <option value={t("inbound_v1.cancel_dialog.reason_other_wh")}>
              {t("inbound_v1.cancel_dialog.reason_other_wh")}
            </option>
            <option value={t("inbound_v1.cancel_dialog.reason_other")}>
              {t("inbound_v1.cancel_dialog.reason_other")}
            </option>
          </select>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {t("inbound_v1.cancel_dialog.cancel")}
            </Button>
            <Button
              onClick={doCancel}
              disabled={busy}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("inbound_v1.cancel_dialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abandon dialog */}
      <AlertDialog open={abandonOpen} onOpenChange={setAbandonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("inbound_v1.abandon_dialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block py-1">
                {t("inbound_v1.abandon_dialog.warning_1")}
              </span>
              <span className="block py-1">
                {t("inbound_v1.abandon_dialog.warning_2")}
              </span>
              <span className="block py-1">
                {t("inbound_v1.abandon_dialog.warning_3")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2 mt-2">
            <Checkbox
              id="ack"
              checked={abandonAck}
              onCheckedChange={(v) => setAbandonAck(v === true)}
            />
            <Label htmlFor="ack" className="font-normal text-sm leading-5">
              {t("inbound_v1.abandon_dialog.ack_label")}
            </Label>
          </div>
          <Label>{t("inbound_v1.abandon_dialog.type_label")}</Label>
          <Input
            value={abandonType}
            onChange={(e) => setAbandonType(e.target.value)}
            placeholder="廢棄"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setAbandonAck(false);
                setAbandonType("");
              }}
            >
              {t("inbound_v1.abandon_dialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={doAbandon}
              disabled={busy || !abandonAck || abandonType !== "廢棄"}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("inbound_v1.abandon_dialog.submit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function Row({
  label,
  children,
  span2,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "sm:col-span-2" : undefined}>
      <dt className="text-xs uppercase text-gray-500 mb-1">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

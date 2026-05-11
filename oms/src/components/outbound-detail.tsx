"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Outbound {
  _id: string;
  client_id: string;
  warehouseCode: string;
  shipment_type: "consolidated" | "single";
  inbound_count: number;
  carrier_code: string;
  carrier_account_id: string | null;
  destination_country: string;
  receiver_address: {
    name: string;
    phone: string;
    country_code: string;
    city: string;
    district?: string;
    address: string;
    postal_code?: string;
  };
  processing_preference: "auto" | "confirm_before_label";
  status: string;
  held_reason: string | null;
  held_detail: string | null;
  declared_weight_kg: number | null;
  actual_weight_kg: number | null;
  rate_quote: {
    base_fee: number;
    per_kg_fee: number;
    weight_kg: number;
    country_multiplier: number;
    carrier_multiplier: number;
    surcharge: number;
    total: number;
    currency: string;
  } | null;
  quoted_amount_hkd: number | null;
  label_url: string | null;
  tracking_no: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  customer_remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

const CANCELLABLE = new Set(["held", "ready_for_label", "pending_client_label"]);

export const OutboundDetail = ({ outboundId }: { outboundId: string }) => {
  const t = useTranslations();
  const router = useRouter();
  const [doc, setDoc] = useState<Outbound | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await http_request("GET", `/api/cms/outbound/${outboundId}`, {});
    const data = await res.json();
    if (data.status === 200) {
      setDoc(data.data);
    } else {
      setError(data.message ?? "load failed");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [outboundId]);

  const handleRetryLabel = async () => {
    setRetrying(true);
    setError("");
    try {
      const res = await http_request(
        "POST",
        `/api/cms/admin/outbound/${outboundId}/retry-label`,
        {}
      );
      const data = await res.json();
      if (data.status === 200) {
        await load();
      } else {
        setError(data.message ?? "retry failed");
      }
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await http_request(
        "POST",
        `/api/cms/outbound/${outboundId}/cancel`,
        { cancel_reason: cancelReason }
      );
      const data = await res.json();
      if (data.status === 200) {
        setCancelOpen(false);
        await load();
      } else {
        setError(data.message ?? "cancel failed");
      }
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500 py-12 text-center">{t("common.loading")}</p>;
  }
  if (!doc) {
    return (
      <p className="text-red-600 py-12 text-center">
        {error || t("common.not_found")}
      </p>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 grid gap-4">
      {/* Header */}
      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <div className="font-mono text-xs text-gray-500">{doc._id}</div>
            <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2">
              {t(`outbound_v1.status.${doc.status}` as any)}
              {doc.held_reason && (
                <Badge variant="outline" className="text-amber-700">
                  {doc.held_reason}
                </Badge>
              )}
              <Badge variant="secondary">
                {t(`outbound_v1.shipment_type.${doc.shipment_type}` as any)}
              </Badge>
            </h1>
            {doc.held_detail && (
              <p className="text-sm text-amber-700 mt-1">{doc.held_detail}</p>
            )}
          </div>
          <div className="flex gap-2">
            {doc.label_url && (
              <a
                href={doc.label_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-2 border rounded text-sm hover:bg-gray-50"
              >
                {t("outbound_v1.detail.download_label")}
              </a>
            )}
            {doc.held_reason === "label_failed_retry" && (
              <Button onClick={handleRetryLabel} disabled={retrying}>
                {retrying
                  ? t("outbound_v1.detail.retry_label_running")
                  : t("outbound_v1.detail.retry_label_btn")}
              </Button>
            )}
            {CANCELLABLE.has(doc.status) && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                {t("outbound_v1.detail.cancel_btn")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Shipment summary */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t("outbound_v1.detail.section_shipment")}
          </h2>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row label={t("outbound_v1.detail.carrier")}>
            {doc.carrier_code}
          </Row>
          <Row label={t("outbound_v1.detail.warehouse")}>
            {doc.warehouseCode}
          </Row>
          <Row label={t("outbound_v1.detail.inbound_count")}>
            {doc.inbound_count}
          </Row>
          <Row label={t("outbound_v1.detail.preference")}>
            {t(`outbound_v1.preference.${doc.processing_preference}` as any)}
          </Row>
          <Row label={t("outbound_v1.detail.declared_weight")}>
            {doc.declared_weight_kg ? `${doc.declared_weight_kg.toFixed(2)} kg` : "—"}
          </Row>
          <Row label={t("outbound_v1.detail.actual_weight")}>
            {doc.actual_weight_kg ? `${doc.actual_weight_kg.toFixed(2)} kg` : "—"}
          </Row>
          <Row label={t("outbound_v1.detail.tracking_no")}>
            <span className="font-mono">{doc.tracking_no ?? "—"}</span>
          </Row>
          <Row label={t("outbound_v1.detail.created_at")}>
            {new Date(doc.createdAt).toLocaleString()}
          </Row>
          {doc.customer_remarks && (
            <Row label={t("outbound_v1.detail.remarks")} full>
              {doc.customer_remarks}
            </Row>
          )}
        </CardContent>
      </Card>

      {/* Receiver */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t("outbound_v1.detail.section_receiver")}
          </h2>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row label={t("outbound_v1.new.recipient_name")}>
            {doc.receiver_address.name}
          </Row>
          <Row label={t("outbound_v1.new.recipient_phone")}>
            {doc.receiver_address.phone}
          </Row>
          <Row label={t("outbound_v1.new.destination_country")}>
            {doc.receiver_address.country_code}
          </Row>
          <Row label={t("outbound_v1.new.recipient_city")}>
            {doc.receiver_address.city}
          </Row>
          {doc.receiver_address.district && (
            <Row label={t("outbound_v1.new.recipient_district")}>
              {doc.receiver_address.district}
            </Row>
          )}
          <Row label={t("outbound_v1.new.recipient_postal")}>
            {doc.receiver_address.postal_code ?? "—"}
          </Row>
          <Row label={t("outbound_v1.new.recipient_address")} full>
            {doc.receiver_address.address}
          </Row>
        </CardContent>
      </Card>

      {/* Rate breakdown */}
      {doc.rate_quote && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {t("outbound_v1.detail.section_rate")}
            </h2>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label={t("outbound_v1.rate.base_fee")}>
              HK${doc.rate_quote.base_fee}
            </Row>
            <Row label={t("outbound_v1.rate.per_kg_fee")}>
              HK${doc.rate_quote.per_kg_fee} × {doc.rate_quote.weight_kg.toFixed(2)}kg
            </Row>
            <Row label={t("outbound_v1.rate.country_multiplier")}>
              ×{doc.rate_quote.country_multiplier}
            </Row>
            <Row label={t("outbound_v1.rate.carrier_multiplier")}>
              ×{doc.rate_quote.carrier_multiplier}
            </Row>
            <Row label={t("outbound_v1.rate.total")} full>
              <span className="text-lg font-semibold">
                HK${doc.rate_quote.total}
              </span>
            </Row>
          </CardContent>
        </Card>
      )}

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("outbound_v1.detail.cancel_dialog_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("outbound_v1.detail.cancel_dialog_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Textarea
              placeholder={t("outbound_v1.detail.cancel_reason_placeholder")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling}>
              {cancelling
                ? t("common.loading")
                : t("outbound_v1.detail.cancel_confirm_btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const Row = ({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) => (
  <div className={full ? "col-span-2" : ""}>
    <div className="text-xs text-gray-500">{label}</div>
    <div>{children}</div>
  </div>
);

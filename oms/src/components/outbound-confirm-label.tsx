"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Outbound {
  _id: string;
  status: string;
  carrier_code: string;
  destination_country: string;
  processing_preference: string;
  held_reason: string | null;
  held_detail: string | null;
  quoted_amount_hkd: number | null;
  actual_weight_kg: number | null;
  rate_quote: {
    base_fee: number;
    per_kg_fee: number;
    weight_kg: number;
    country_multiplier: number;
    carrier_multiplier: number;
    total: number;
  } | null;
}

export const OutboundConfirmLabel = ({
  outboundId,
}: {
  outboundId: string;
}) => {
  const t = useTranslations();
  const router = useRouter();
  const [doc, setDoc] = useState<Outbound | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await http_request(
      "GET",
      `/api/cms/outbound/${outboundId}`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) setDoc(d.data);
    else setError(d.message ?? "load failed");
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [outboundId]);

  const confirm = async () => {
    setSubmitting(true);
    setError("");
    const r = await http_request(
      "POST",
      `/api/cms/outbound/${outboundId}/confirm-label`,
      {}
    );
    const d = await r.json();
    setSubmitting(false);
    if (d.status === 200) {
      setSuccess(
        t("outbound_v1.confirm_label.success", {
          count: d.data.box_count,
          total: d.data.total_label_fee,
        })
      );
      await load();
      setTimeout(() => router.push(`/zh-hk/outbound/${outboundId}`), 1500);
    } else {
      setError(d.message ?? "fail");
    }
  };

  if (loading)
    return (
      <p className="text-center text-gray-500 py-12">{t("common.loading")}</p>
    );
  if (!doc) return <p className="text-red-600">{error}</p>;

  const ready = doc.status === "pending_client_label";
  const held = doc.status === "held";

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">
              {t("outbound_v1.confirm_label.title")}
            </h1>
            <Badge variant="secondary">
              {t(`outbound_v1.status.${doc.status}` as any)}
              {doc.held_reason ? ` · ${doc.held_reason}` : ""}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 font-mono mt-1">{doc._id}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {held && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
              <div className="font-medium text-amber-800">
                {t("outbound_v1.confirm_label.held_notice")}
              </div>
              {doc.held_detail && (
                <div className="text-amber-700 text-xs mt-1">
                  {doc.held_detail}
                </div>
              )}
            </div>
          )}

          {doc.rate_quote && (
            <div className="border rounded p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {t("outbound_v1.confirm_label.weight")}
                </span>
                <span>{doc.rate_quote.weight_kg.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {t("outbound_v1.confirm_label.carrier")}
                </span>
                <span>
                  {doc.carrier_code} → {doc.destination_country}
                </span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1 text-base">
                <span className="font-semibold">
                  {t("outbound_v1.confirm_label.total")}
                </span>
                <span className="font-semibold">
                  HK${doc.rate_quote.total}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                base HK${doc.rate_quote.base_fee} + {doc.rate_quote.weight_kg.toFixed(2)}kg × HK$
                {doc.rate_quote.per_kg_fee} × country{" "}
                {doc.rate_quote.country_multiplier} × carrier{" "}
                {doc.rate_quote.carrier_multiplier}
              </div>
            </div>
          )}

          {ready && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
              <p>{t("outbound_v1.confirm_label.proceed_notice")}</p>
            </div>
          )}

          {success && <p className="text-emerald-700 text-sm">{success}</p>}
          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/zh-hk/outbound/${outboundId}`)}
            >
              {t("common.back")}
            </Button>
            {ready && (
              <Button onClick={confirm} disabled={submitting}>
                {submitting
                  ? t("common.loading")
                  : t("outbound_v1.confirm_label.btn")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

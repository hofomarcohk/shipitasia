"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface EligibleInbound {
  _id: string;
  warehouseCode: string;
  tracking_no: string;
  shipment_type: "consolidated" | "single";
  actualWeight: number | null;
  status: string;
}

interface CarrierOption {
  carrier_code: string;
  name_zh: string;
  auth_type: "api_key" | "oauth";
}

interface CarrierAccount {
  _id: string;
  carrier_code: string;
  nickname: string;
  status: string;
}

interface Quote {
  carrier_code: string;
  base_fee: number;
  per_kg_fee: number;
  weight_kg: number;
  country_multiplier: number;
  carrier_multiplier: number;
  surcharge: number;
  total: number;
  currency: "HKD";
}

const COUNTRY_OPTIONS = [
  { code: "HK", name: "香港" },
  { code: "TW", name: "台灣" },
  { code: "CN", name: "中國大陸" },
  { code: "SG", name: "新加坡" },
  { code: "JP", name: "日本" },
  { code: "US", name: "美國" },
  { code: "GB", name: "英國" },
  { code: "AU", name: "澳洲" },
];

export const OutboundNewForm = () => {
  const t = useTranslations();
  const router = useRouter();

  // Master + eligible data
  const [eligibles, setEligibles] = useState<EligibleInbound[]>([]);
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [carrierAccounts, setCarrierAccounts] = useState<CarrierAccount[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loadingMaster, setLoadingMaster] = useState(true);

  // Form state
  const [selectedInbounds, setSelectedInbounds] = useState<string[]>([]);
  const [carrierCode, setCarrierCode] = useState("");
  const [carrierAccountId, setCarrierAccountId] = useState("");
  const [country, setCountry] = useState("HK");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [postal, setPostal] = useState("");
  const [preference, setPreference] = useState<"auto" | "confirm_before_label">(
    "auto"
  );
  const [remarks, setRemarks] = useState("");

  // Quote state
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [inbRes, cRes, accRes, bRes] = await Promise.all([
        http_request("GET", "/api/cms/inbound", {
          status: "received",
          page_size: 200,
        }),
        http_request("GET", "/api/cms/carriers", {}),
        http_request("GET", "/api/cms/carrier-accounts", {}),
        http_request("GET", "/api/cms/wallet/balance", {}),
      ]);
      const inbData = await inbRes.json();
      const cData = await cRes.json();
      const accData = await accRes.json();
      const bData = await bRes.json();
      if (inbData.status === 200) {
        setEligibles(
          (inbData.data.items as EligibleInbound[]).filter(
            (i) => i.shipment_type === "consolidated"
          )
        );
      }
      if (cData.status === 200) setCarriers(cData.data ?? []);
      if (accData.status === 200) setCarrierAccounts(accData.data ?? []);
      if (bData.status === 200) setBalance(bData.data?.balance ?? 0);
      setLoadingMaster(false);
    })();
  }, []);

  const selectedWeight = useMemo(() => {
    const sel = eligibles.filter((i) => selectedInbounds.includes(i._id));
    if (sel.length === 0) return 0;
    let total = 0;
    let known = false;
    for (const i of sel) {
      if (typeof i.actualWeight === "number" && i.actualWeight > 0) {
        total += i.actualWeight;
        known = true;
      } else {
        total += 2;
      }
    }
    if (!known) total = sel.length * 2;
    return Math.max(0.1, total);
  }, [eligibles, selectedInbounds]);

  const requireAccount = useMemo(() => {
    const c = carriers.find((c) => c.carrier_code === carrierCode);
    return c?.auth_type === "oauth";
  }, [carriers, carrierCode]);

  const handlePreviewQuote = async () => {
    setQuote(null);
    setQuoteError("");
    if (!carrierCode || !country || selectedWeight <= 0) {
      setQuoteError(t("outbound_v1.new.missing_quote_fields"));
      return;
    }
    setQuoteLoading(true);
    try {
      const res = await http_request("POST", "/api/cms/outbound/rate-quote-preview", {
        carrier_code: carrierCode,
        destination_country: country,
        weight_kg: selectedWeight,
      });
      const data = await res.json();
      if (data.status === 200) {
        setQuote(data.data);
      } else {
        setQuoteError(data.message ?? "quote failed");
      }
    } catch (e: any) {
      setQuoteError(String(e?.message ?? e));
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (selectedInbounds.length === 0) {
      setError(t("outbound_v1.new.select_inbounds"));
      return;
    }
    if (!carrierCode) {
      setError(t("outbound_v1.new.select_carrier"));
      return;
    }
    if (requireAccount && !carrierAccountId) {
      setError(t("outbound_v1.new.select_account"));
      return;
    }
    if (!name || !phone || !city || !address) {
      setError(t("outbound_v1.new.missing_address"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await http_request("POST", "/api/cms/outbound", {
        shipment_type: "consolidated",
        inbound_ids: selectedInbounds,
        carrier_code: carrierCode,
        carrier_account_id: carrierAccountId || null,
        receiver_address: {
          name,
          phone,
          country_code: country,
          city,
          district: district || undefined,
          address,
          postal_code: postal || undefined,
        },
        processing_preference: preference,
        customer_remarks: remarks || undefined,
      });
      const data = await res.json();
      if (data.status === 200) {
        router.push(`/zh-hk/outbound/${data.data._id}`);
      } else {
        setError(data.message ?? "failed");
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingMaster) {
    return <p className="text-gray-500 py-12 text-center">{t("common.loading")}</p>;
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 grid gap-4">
      {/* Inbound multi-select */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t("outbound_v1.new.step_inbounds")}
          </h2>
        </CardHeader>
        <CardContent>
          {eligibles.length === 0 ? (
            <p className="text-gray-500">
              {t("outbound_v1.new.no_eligible_inbounds")}
            </p>
          ) : (
            <div className="grid gap-2">
              {eligibles.map((i) => (
                <label
                  key={i._id}
                  className="flex items-center gap-3 border rounded p-3 hover:bg-gray-50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedInbounds.includes(i._id)}
                    onCheckedChange={(v) => {
                      setSelectedInbounds((prev) =>
                        v ? [...prev, i._id] : prev.filter((x) => x !== i._id)
                      );
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-mono text-xs">{i._id}</div>
                    <div className="text-xs text-gray-500">
                      {i.warehouseCode} · {i.tracking_no} ·{" "}
                      {i.actualWeight ? `${i.actualWeight}kg` : "weight TBD"}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
          <p className="text-sm text-gray-500 mt-3">
            {t("outbound_v1.new.estimated_weight")}: {selectedWeight.toFixed(2)} kg
          </p>
        </CardContent>
      </Card>

      {/* Carrier + destination */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t("outbound_v1.new.step_carrier")}
          </h2>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("outbound_v1.new.carrier")}</Label>
              <select
                className="w-full border rounded h-9 px-2"
                value={carrierCode}
                onChange={(e) => {
                  setCarrierCode(e.target.value);
                  setQuote(null);
                  setCarrierAccountId("");
                }}
              >
                <option value="">—</option>
                {carriers.map((c) => (
                  <option key={c.carrier_code} value={c.carrier_code}>
                    {c.name_zh} ({c.carrier_code})
                  </option>
                ))}
              </select>
            </div>
            {requireAccount && (
              <div>
                <Label>{t("outbound_v1.new.carrier_account")}</Label>
                <select
                  className="w-full border rounded h-9 px-2"
                  value={carrierAccountId}
                  onChange={(e) => setCarrierAccountId(e.target.value)}
                >
                  <option value="">—</option>
                  {carrierAccounts
                    .filter((a) => a.carrier_code === carrierCode)
                    .map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.nickname}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div>
              <Label>{t("outbound_v1.new.destination_country")}</Label>
              <select
                className="w-full border rounded h-9 px-2"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setQuote(null);
                }}
              >
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Button
              variant="outline"
              onClick={handlePreviewQuote}
              disabled={quoteLoading || !carrierCode}
            >
              {quoteLoading
                ? t("common.loading")
                : t("outbound_v1.new.preview_quote_btn")}
            </Button>
          </div>
          {quoteError && <p className="text-sm text-red-600">{quoteError}</p>}
          {quote && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm grid gap-1">
              <div className="font-semibold">
                {t("outbound_v1.new.quote_total")}: HK${quote.total}
              </div>
              <div className="text-xs text-gray-600">
                base HK${quote.base_fee} + {quote.weight_kg.toFixed(2)}kg × HK$
                {quote.per_kg_fee} × country {quote.country_multiplier} × carrier{" "}
                {quote.carrier_multiplier}
              </div>
              <div className="text-xs text-gray-600">
                {t("outbound_v1.new.balance")}: HK${balance}{" "}
                {balance < quote.total && (
                  <span className="text-amber-700">
                    · {t("outbound_v1.new.balance_insufficient")}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receiver address */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t("outbound_v1.new.step_address")}
          </h2>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("outbound_v1.new.recipient_name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("outbound_v1.new.recipient_phone")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>{t("outbound_v1.new.recipient_city")}</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label>{t("outbound_v1.new.recipient_district")}</Label>
            <Input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Label>{t("outbound_v1.new.recipient_address")}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("outbound_v1.new.recipient_postal")}</Label>
            <Input value={postal} onChange={(e) => setPostal(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Processing preference + remarks */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t("outbound_v1.new.step_preference")}
          </h2>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 border rounded p-3 cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                checked={preference === "auto"}
                onChange={() => setPreference("auto")}
              />
              <div>
                <div className="text-sm font-medium">
                  {t("outbound_v1.new.preference_auto")}
                </div>
                <div className="text-xs text-gray-500">
                  {t("outbound_v1.new.preference_auto_desc")}
                </div>
              </div>
            </label>
            <label className="flex items-center gap-2 border rounded p-3 cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                checked={preference === "confirm_before_label"}
                onChange={() => setPreference("confirm_before_label")}
              />
              <div>
                <div className="text-sm font-medium">
                  {t("outbound_v1.new.preference_confirm")}
                </div>
                <div className="text-xs text-gray-500">
                  {t("outbound_v1.new.preference_confirm_desc")}
                </div>
              </div>
            </label>
          </div>
          <div>
            <Label>{t("outbound_v1.new.remarks")}</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/zh-hk/outbound/list")}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? t("common.loading") : t("outbound_v1.new.submit_btn")}
        </Button>
      </div>
    </div>
  );
};

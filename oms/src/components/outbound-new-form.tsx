"use client";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
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

interface AggregatedSummary {
  item_count: number;
  total_value: number;
  contains_liquid: boolean;
  contains_battery: boolean;
  currencies: string[];
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

  // Saved-address picker
  const [savedAddresses, setSavedAddresses] = useState<
    Array<{
      _id: string;
      label: string;
      name: string;
      phone: string;
      country_code: string;
      city: string;
      district: string | null;
      address: string;
      postal_code: string | null;
      is_default: boolean;
    }>
  >([]);
  const [savedAddressId, setSavedAddressId] = useState("");

  // ── P10 redesign · section-locking + aggregate from picked inbounds.
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [aggregated, setAggregated] = useState<AggregatedSummary | null>(null);
  const [aggregating, setAggregating] = useState(false);
  // Which inbound did the recipient prefill come from (banner in section 3).
  const [recipientFromInbound, setRecipientFromInbound] = useState<string | null>(
    null
  );

  useEffect(() => {
    (async () => {
      const [inbRes, cRes, accRes, bRes, saRes] = await Promise.all([
        http_request("GET", "/api/cms/inbound", {
          status: "received",
          page_size: 200,
        }),
        http_request("GET", "/api/cms/carriers", {}),
        http_request("GET", "/api/cms/carrier-accounts", {}),
        http_request("GET", "/api/cms/wallet/balance", {}),
        http_request("GET", "/api/cms/saved-addresses", {}),
      ]);
      const inbData = await inbRes.json();
      const cData = await cRes.json();
      const accData = await accRes.json();
      const bData = await bRes.json();
      const saData = await saRes.json();
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
      if (saData.status === 200) setSavedAddresses(saData.data ?? []);
      setLoadingMaster(false);
    })();
  }, []);

  // ── Aggregate items + sync OQ-3 recipient from picked inbounds.
  // Re-runs whenever the customer picks/unpicks an inbound in section 1.
  useEffect(() => {
    if (selectedInbounds.length === 0) {
      setAggregated(null);
      return;
    }
    setAggregating(true);
    (async () => {
      const results = await Promise.all(
        selectedInbounds.map((id) =>
          http_request("GET", `/api/cms/inbound/${id}`, {}).then((r) =>
            r.json()
          )
        )
      );
      let item_count = 0;
      let total_value = 0;
      let contains_liquid = false;
      let contains_battery = false;
      const currencies = new Set<string>();
      let recipientPrefillSource: any = null;
      for (const d of results) {
        if (d.status !== 200 || !d.data) continue;
        const inb = d.data.inbound;
        const items = d.data.declared_items ?? [];
        item_count += items.length;
        for (const it of items) {
          total_value += (it.quantity ?? 0) * (it.unit_price ?? 0);
          if (it.currency) currencies.add(it.currency);
        }
        if (inb.contains_liquid) contains_liquid = true;
        if (inb.contains_battery) contains_battery = true;
        // OQ-3: default recipient from the FIRST picked inbound that has a
        // single_shipping receiver. Multi-inbound merges typically share
        // the same destination, so first-wins is good enough.
        if (
          !recipientPrefillSource &&
          inb.single_shipping &&
          inb.single_shipping.receiver_address
        ) {
          recipientPrefillSource = { id: inb._id, ...inb.single_shipping };
        }
      }
      setAggregated({
        item_count,
        total_value,
        contains_liquid,
        contains_battery,
        currencies: Array.from(currencies),
      });
      // Only prefill recipient if the form is still blank (don't overwrite
      // user edits when they tweak the inbound selection).
      if (recipientPrefillSource && !name && !phone && !address) {
        const a = recipientPrefillSource.receiver_address;
        setName(a.name);
        setPhone(a.phone);
        setCountry(a.country_code);
        setCity(a.city);
        setDistrict(a.district ?? "");
        setAddress(a.address);
        setPostal(a.postal_code ?? "");
        if (recipientPrefillSource.carrier_account_id) {
          setCarrierAccountId(recipientPrefillSource.carrier_account_id);
        }
        setRecipientFromInbound(recipientPrefillSource.id);
      }
      setAggregating(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInbounds]);

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
      const res = await http_request(
        "POST",
        "/api/cms/outbound/rate-quote-preview",
        {
          carrier_code: carrierCode,
          destination_country: country,
          weight_kg: selectedWeight,
        }
      );
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

  // Auto-refresh the quote whenever the inputs that drive it change.
  // Keeps section 4 informative without forcing the customer to click
  // "預覽運費" again after every tweak.
  useEffect(() => {
    if (!carrierCode || selectedWeight <= 0) {
      setQuote(null);
      return;
    }
    handlePreviewQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierCode, country, selectedWeight]);

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

  // ── Section state machine (mirrors inbound-new-form pattern).
  const s1Complete = selectedInbounds.length >= 1;
  const s2Complete = !!aggregated && aggregated.item_count > 0;
  const s3Complete =
    !!carrierCode &&
    (!requireAccount || !!carrierAccountId) &&
    !!name &&
    !!phone &&
    !!city &&
    !!address;
  // OQ-4: balance shortfall is a WARN, not a block on the form's progression.
  // Section 4 is always "active" until the customer hits 確認出貨 — the
  // button itself disables when balance < quote.total.
  const sections = [1, 2, 3, 4];
  const completes: Record<number, boolean> = {
    1: s1Complete,
    2: s2Complete,
    3: s3Complete,
    4: false,
  };
  const sectionStatus = (n: number): "editing" | "done" | "locked" => {
    if (editingSection === n) return "editing";
    const idx = sections.indexOf(n);
    if (idx === -1) return "locked";
    const prev = idx === 0 ? null : sections[idx - 1];
    if (prev !== null && !completes[prev]) return "locked";
    if (completes[n]) return "done";
    return "editing";
  };

  const balanceShort = quote ? Math.max(0, quote.total - balance) : 0;
  const canSubmit =
    !submitting && s1Complete && s2Complete && s3Complete && balanceShort === 0;

  if (loadingMaster) {
    return (
      <p className="text-gray-500 py-12 text-center">{t("common.loading")}</p>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <div className="grid lg:grid-cols-[1fr_220px] gap-6">
        <div className="grid gap-4 min-w-0">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">
              {t("outbound_v1.new.title")}
            </h1>
            <div className="text-sm text-gray-600 flex items-center gap-2">
              <span>{t("outbound_v1.new.balance")}：</span>
              <span
                className={
                  balanceShort > 0
                    ? "text-amber-700 font-semibold"
                    : "font-mono"
                }
              >
                HK${balance.toLocaleString()}
              </span>
            </div>
          </div>

          {/* ── Section 1 · 揀預報 ── */}
          <SectionCard
            n={1}
            title={t("outbound_v1.new.section1_title")}
            status={sectionStatus(1)}
            summary={
              s1Complete ? (
                <div className="text-sm">
                  {selectedInbounds.length} {t("outbound_v1.new.section1_count_unit")} · ~
                  {selectedWeight.toFixed(2)} kg
                  <div className="text-xs text-gray-500 mt-1 font-mono">
                    {selectedInbounds.slice(0, 3).join(" · ")}
                    {selectedInbounds.length > 3
                      ? ` … +${selectedInbounds.length - 3}`
                      : ""}
                  </div>
                </div>
              ) : null
            }
            onEdit={() => setEditingSection(1)}
            onDone={() => setEditingSection(null)}
          >
            {eligibles.length === 0 ? (
              <p className="text-gray-500 text-sm">
                {t("outbound_v1.new.no_eligible_inbounds")}
              </p>
            ) : (
              <div className="grid gap-2 max-h-80 overflow-y-auto">
                {eligibles.map((i) => (
                  <label
                    key={i._id}
                    className="flex items-center gap-3 border rounded p-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedInbounds.includes(i._id)}
                      onCheckedChange={(v) => {
                        setSelectedInbounds((prev) =>
                          v
                            ? [...prev, i._id]
                            : prev.filter((x) => x !== i._id)
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
              {t("outbound_v1.new.estimated_weight")}：
              {selectedWeight.toFixed(2)} kg
            </p>
          </SectionCard>

          {/* ── Section 2 · 申報品項覆核 (KV, sourced from picks) ── */}
          <SectionCard
            n={2}
            title={t("outbound_v1.new.section2_title")}
            status={sectionStatus(2)}
            summary={
              s2Complete && aggregated ? (
                <div className="text-sm">
                  {aggregated.item_count} {t("outbound_v1.new.section1_count_unit")} ·{" "}
                  {aggregated.currencies.length === 1
                    ? `${aggregated.currencies[0]} ${aggregated.total_value.toLocaleString()}`
                    : aggregated.total_value.toLocaleString()}
                  {aggregated.contains_liquid && (
                    <span className="text-amber-700"> · 含液體</span>
                  )}
                  {aggregated.contains_battery && (
                    <span className="text-amber-700"> · 含電池</span>
                  )}
                </div>
              ) : null
            }
            onEdit={() => setEditingSection(2)}
            onDone={() => setEditingSection(null)}
            hideEditButton
          >
            {aggregating ? (
              <p className="text-sm text-gray-500">{t("common.loading")}</p>
            ) : aggregated ? (
              <div className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                <span className="text-gray-500">總件數</span>
                <span>
                  <b>{aggregated.item_count}</b>{" "}
                  {t("outbound_v1.new.section1_count_unit")}
                </span>
                <span className="text-gray-500">
                  {t("outbound_v1.new.section2_total_value")}
                </span>
                <span className="font-semibold">
                  {aggregated.currencies.length === 1
                    ? aggregated.currencies[0]
                    : ""}{" "}
                  {aggregated.total_value.toLocaleString()}
                </span>
                <span className="text-gray-500">特殊屬性</span>
                <span>
                  {aggregated.contains_liquid && (
                    <span className="inline-block mr-2 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">
                      含液體
                    </span>
                  )}
                  {aggregated.contains_battery && (
                    <span className="inline-block mr-2 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">
                      含電池
                    </span>
                  )}
                  {!aggregated.contains_liquid &&
                    !aggregated.contains_battery && (
                      <span className="text-gray-500">無</span>
                    )}
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {t("outbound_v1.new.section2_aggregated")}
              </p>
            )}
          </SectionCard>

          {/* ── Section 3 · 收件人 + Carrier + 派送速度 ── */}
          <SectionCard
            n={3}
            title={t("outbound_v1.new.section3_title")}
            status={sectionStatus(3)}
            summary={
              s3Complete ? (
                <div className="text-sm grid gap-1">
                  <div>
                    {name} · {phone}
                  </div>
                  <div className="text-xs text-gray-600">
                    {country} · {city}
                    {district ? ` · ${district}` : ""} · {address}
                  </div>
                  <div className="text-xs text-gray-600">
                    {carriers.find((c) => c.carrier_code === carrierCode)
                      ?.name_zh ?? carrierCode}{" "}
                    ·{" "}
                    {preference === "auto"
                      ? t("outbound_v1.new.preference_auto")
                      : t("outbound_v1.new.preference_confirm")}
                  </div>
                </div>
              ) : null
            }
            onEdit={() => setEditingSection(3)}
            onDone={() => setEditingSection(null)}
          >
            <div className="grid gap-4">
              {recipientFromInbound && (
                <div className="rounded-md border bg-emerald-50 border-emerald-200 px-3 py-2 text-xs text-emerald-800">
                  {t("outbound_v1.new.applied_recipient_from_inbound", {
                    id: recipientFromInbound,
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("outbound_v1.new.carrier")}</Label>
                  <select
                    className="w-full border rounded h-9 px-2"
                    value={carrierCode}
                    onChange={(e) => {
                      setCarrierCode(e.target.value);
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
                    onChange={(e) => setCountry(e.target.value)}
                  >
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Label className="text-xs text-gray-500 whitespace-nowrap">
                  {t("addresses.picker_label")}
                </Label>
                <select
                  className="flex-1 border rounded h-9 px-2 text-sm"
                  value={savedAddressId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSavedAddressId(id);
                    if (!id) return;
                    const a = savedAddresses.find((x) => x._id === id);
                    if (!a) return;
                    setName(a.name);
                    setPhone(a.phone);
                    setCountry(a.country_code);
                    setCity(a.city);
                    setDistrict(a.district ?? "");
                    setAddress(a.address);
                    setPostal(a.postal_code ?? "");
                    setRecipientFromInbound(null);
                  }}
                >
                  <option value="">
                    {savedAddresses.length === 0
                      ? t("addresses.picker_empty")
                      : "—"}
                  </option>
                  {savedAddresses.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.label}
                      {a.is_default ? " ⭐" : ""}
                    </option>
                  ))}
                </select>
                <a
                  href="/zh-hk/addresses"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 text-xs whitespace-nowrap"
                >
                  {t("addresses.picker_manage")}
                </a>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("outbound_v1.new.recipient_name")}</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>{t("outbound_v1.new.recipient_phone")}</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div>
                  <Label>{t("outbound_v1.new.recipient_city")}</Label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
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
                  <Input
                    value={postal}
                    onChange={(e) => setPostal(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">
                  {t("outbound_v1.new.step_preference")}
                </Label>
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
              </div>
            </div>
          </SectionCard>

          {/* ── Section 4 · 確認摘要 + 落單 ── */}
          <SectionCard
            n={4}
            title={t("outbound_v1.new.section4_title")}
            status={sectionStatus(4)}
            summary={null}
            onEdit={() => setEditingSection(4)}
            onDone={() => setEditingSection(null)}
            hideEditButton
            emphasis={balanceShort > 0 ? "warn" : undefined}
          >
            <div className="grid gap-4">
              <div className="grid grid-cols-[160px_1fr] gap-y-1 text-sm">
                <span className="text-gray-500">運費（預估）</span>
                <span>
                  {quoteLoading
                    ? t("common.loading")
                    : quote
                    ? `HK$${quote.total.toLocaleString()}`
                    : "—"}
                </span>
                <span className="text-gray-500">預估重量</span>
                <span>{selectedWeight.toFixed(2)} kg</span>
                <span className="text-gray-500">目的地</span>
                <span>{country}</span>
                <span className="text-gray-500">物流商</span>
                <span>
                  {carriers.find((c) => c.carrier_code === carrierCode)
                    ?.name_zh ?? carrierCode}
                </span>
                <span className="text-gray-500">
                  {t("outbound_v1.new.balance")}
                </span>
                <span
                  className={
                    balanceShort > 0
                      ? "text-amber-700 font-semibold"
                      : ""
                  }
                >
                  HK${balance.toLocaleString()}
                  {balanceShort > 0 && (
                    <>
                      {" "}
                      <span className="text-xs">
                        ({t("outbound_v1.new.balance_short_by", { amount: balanceShort })})
                      </span>
                    </>
                  )}
                </span>
              </div>

              {quoteError && (
                <p className="text-sm text-red-600">{quoteError}</p>
              )}

              {balanceShort > 0 && (
                <div className="rounded-md border bg-amber-50 border-amber-300 px-4 py-3 text-sm">
                  <b className="text-amber-900">
                    {t("outbound_v1.new.balance_warn_title")}
                  </b>
                  <p className="text-amber-800 mt-1">
                    {t("outbound_v1.new.balance_warn_body")}
                  </p>
                </div>
              )}

              <div>
                <Label>{t("outbound_v1.new.remarks")}</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => router.push("/zh-hk/outbound/list")}
                >
                  {t("common.cancel")}
                </Button>
                {balanceShort > 0 && (
                  <Link href="/zh-hk/wallet">
                    <Button variant="default">
                      {t("outbound_v1.new.go_topup_btn")}
                    </Button>
                  </Link>
                )}
                <Button onClick={handleSubmit} disabled={!canSubmit}>
                  {submitting
                    ? t("common.loading")
                    : balanceShort > 0
                    ? t("outbound_v1.new.submit_disabled_balance")
                    : t("outbound_v1.new.submit_btn")}
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Right rail stepper */}
        <aside className="hidden lg:block sticky top-6 self-start">
          <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
            Section Index
          </div>
          <div className="grid gap-2">
            {sections.map((n, i) => {
              const status = sectionStatus(n);
              const labelKey: Record<number, string> = {
                1: "outbound_v1.new.section1_title",
                2: "outbound_v1.new.section2_title",
                3: "outbound_v1.new.section3_title",
                4: "outbound_v1.new.section4_title",
              };
              const isS4WithShortfall = n === 4 && balanceShort > 0;
              return (
                <div
                  key={n}
                  className={`flex gap-2 items-start p-2 rounded ${
                    isS4WithShortfall
                      ? "bg-amber-50 border border-amber-300"
                      : status === "editing"
                      ? "bg-blue-50 border border-blue-200"
                      : status === "done"
                      ? "bg-emerald-50"
                      : "bg-gray-50 opacity-60"
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                      status === "done"
                        ? "bg-emerald-500 text-white"
                        : isS4WithShortfall
                        ? "bg-amber-500 text-white"
                        : status === "editing"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-300 text-gray-600"
                    }`}
                  >
                    {status === "done" ? "✓" : i + 1}
                  </div>
                  <div className="text-xs leading-tight pt-0.5">
                    <div className="font-medium">
                      {t(labelKey[n] as any)}
                    </div>
                    <div
                      className={
                        isS4WithShortfall
                          ? "text-amber-700"
                          : "text-gray-500"
                      }
                    >
                      {isS4WithShortfall
                        ? "⚠ 餘額不足"
                        : status === "done"
                        ? "已完成"
                        : status === "locked"
                        ? "未解鎖"
                        : "填寫中"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
};

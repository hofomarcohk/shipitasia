"use client";
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
import { Textarea } from "@/components/ui/textarea";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Warehouse {
  warehouseCode: string;
  name_zh: string;
  declared_currency: string;
  address_zh: string;
}

interface CarrierInbound {
  carrier_inbound_code: string;
  name_zh: string;
  tracking_format_hint: string | null;
}

interface Category {
  _id: string;
  name_zh: string;
  subcategories: { _id: string; name_zh: string }[];
}

interface CarrierAccount {
  _id: string;
  carrier_code: string;
  nickname: string;
  status: string;
}

interface ItemDraft {
  draft_id: string; // local-only
  category_id: string;
  subcategory_id: string;
  product_name: string;
  product_url: string;
  quantity: number;
  unit_price: number;
}

// Country phone dial codes — covers the v1 destination countries.
// Keyed by ISO-2 country_code so it composes with the existing receiver
// address shape. Extended ad-hoc as new destinations come online.
const DIAL_CODES: Record<string, string> = {
  HK: "+852",
  TW: "+886",
  CN: "+86",
  JP: "+81",
  US: "+1",
  GB: "+44",
  AU: "+61",
  SG: "+65",
  KR: "+82",
};

// HK 18 districts — only surfaced when country_code=HK. Other countries
// keep the free-text input.
const HK_DISTRICTS: { code: string; zh: string }[] = [
  { code: "central_western", zh: "中西區" },
  { code: "wan_chai", zh: "灣仔" },
  { code: "eastern", zh: "東區" },
  { code: "southern", zh: "南區" },
  { code: "yau_tsim_mong", zh: "油尖旺" },
  { code: "sham_shui_po", zh: "深水埗" },
  { code: "kowloon_city", zh: "九龍城" },
  { code: "wong_tai_sin", zh: "黃大仙" },
  { code: "kwun_tong", zh: "觀塘" },
  { code: "kwai_tsing", zh: "葵青" },
  { code: "tsuen_wan", zh: "荃灣" },
  { code: "tuen_mun", zh: "屯門" },
  { code: "yuen_long", zh: "元朗" },
  { code: "north", zh: "北區" },
  { code: "tai_po", zh: "大埔" },
  { code: "sha_tin", zh: "沙田" },
  { code: "sai_kung", zh: "西貢" },
  { code: "islands", zh: "離島" },
];

export const InboundNewForm = ({ inboundId }: { inboundId?: string }) => {
  const t = useTranslations();
  const router = useRouter();
  const editMode = !!inboundId;

  // Master data
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [carriers, setCarriers] = useState<CarrierInbound[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [carrierAccounts, setCarrierAccounts] = useState<CarrierAccount[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(true);
  const [loadingExisting, setLoadingExisting] = useState(editMode);

  // Form state
  const [warehouseCode, setWarehouseCode] = useState("");
  const [carrierInbound, setCarrierInbound] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [trackingNoOther, setTrackingNoOther] = useState("");
  const [trackingDuplicate, setTrackingDuplicate] = useState(false);
  const [source, setSource] = useState<"regular" | "return" | "gift" | "other">(
    "regular"
  );
  const [sizeEstimate, setSizeEstimate] = useState<"small" | "medium" | "large">(
    "medium"
  );
  const [containsLiquid, setContainsLiquid] = useState(false);
  const [containsBattery, setContainsBattery] = useState(false);
  const [shipmentType, setShipmentType] = useState<"consolidated" | "single">(
    "consolidated"
  );
  // single shipping fields
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientCountry, setRecipientCountry] = useState("HK");
  const [recipientCity, setRecipientCity] = useState("");
  const [recipientDistrict, setRecipientDistrict] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientPostal, setRecipientPostal] = useState("");
  const [carrierAccountId, setCarrierAccountId] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [customerRemarks, setCustomerRemarks] = useState("");
  // Saved-address picker state. Populated on mount; rendered above the
  // receiver block so clients can hydrate the form with one click.
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
  const [savedAddressId, setSavedAddressId] = useState<string>("");

  const [items, setItems] = useState<ItemDraft[]>([]);
  const [itemDrafts, setItemDrafts] = useState<ItemDraft[]>([]);
  const [itemModalOpen, setItemModalOpen] = useState(false);

  const blankItem = (): ItemDraft => ({
    draft_id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    category_id: "",
    subcategory_id: "",
    product_name: "",
    product_url: "",
    quantity: 1,
    unit_price: 0,
  });

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [continueFlash, setContinueFlash] = useState<{
    id: string;
    locale: string;
  } | null>(null);

  // Load master data + existing inbound (edit mode)
  useEffect(() => {
    (async () => {
      const [wRes, cRes, catRes, accRes, saRes] = await Promise.all([
        http_request("GET", "/api/cms/warehouses", {}),
        http_request("GET", "/api/cms/carriers-inbound", {}),
        http_request("GET", "/api/cms/product-categories", {}),
        http_request("GET", "/api/cms/carrier-accounts", {}),
        http_request("GET", "/api/cms/saved-addresses", {}),
      ]);
      const wData = await wRes.json();
      const cData = await cRes.json();
      const catData = await catRes.json();
      const accData = await accRes.json();
      const saData = await saRes.json();
      if (wData.status === 200) {
        setWarehouses(wData.data);
        if (wData.data[0]) setWarehouseCode(wData.data[0].warehouseCode);
      }
      if (cData.status === 200) setCarriers(cData.data);
      if (catData.status === 200) setCategories(catData.data);
      if (accData.status === 200)
        setCarrierAccounts(
          accData.data.filter((a: CarrierAccount) => a.status === "active")
        );
      if (saData.status === 200) setSavedAddresses(saData.data ?? []);
      setLoadingMaster(false);

      if (editMode && inboundId) {
        const r = await http_request(
          "GET",
          `/api/cms/inbound/${inboundId}`,
          {}
        );
        const dd = await r.json();
        if (dd.status === 200) {
          const inb = dd.data.inbound;
          setWarehouseCode(inb.warehouseCode);
          setCarrierInbound(inb.carrier_inbound_code);
          setTrackingNo(inb.tracking_no);
          setTrackingNoOther(inb.tracking_no_other ?? "");
          setSource(inb.inbound_source);
          setSizeEstimate(inb.size_estimate);
          setContainsLiquid(inb.contains_liquid);
          setContainsBattery(inb.contains_battery);
          setShipmentType(inb.shipment_type);
          if (inb.single_shipping) {
            const a = inb.single_shipping.receiver_address;
            setRecipientName(a.name);
            setRecipientPhone(a.phone);
            setRecipientCountry(a.country_code);
            setRecipientCity(a.city);
            setRecipientDistrict(a.district ?? "");
            setRecipientAddress(a.address);
            setRecipientPostal(a.postal_code ?? "");
            setCarrierAccountId(inb.single_shipping.carrier_account_id);
          }
          setCustomerRemarks(inb.customer_remarks ?? "");
          setItems(
            dd.data.declared_items.map((d: any, i: number) => ({
              draft_id: `existing_${i}`,
              category_id: d.category_id,
              subcategory_id: d.subcategory_id,
              product_name: d.product_name,
              product_url: d.product_url ?? "",
              quantity: d.quantity,
              unit_price: d.unit_price,
            }))
          );
        }
        setLoadingExisting(false);
      }
    })();
  }, [inboundId, editMode]);

  // tracking dedupe onBlur
  const checkDuplicate = async () => {
    if (!trackingNo || !carrierInbound) {
      setTrackingDuplicate(false);
      return;
    }
    const res = await http_request(
      "GET",
      "/api/cms/inbound/check-duplicate",
      { carrier_inbound: carrierInbound, tracking_no: trackingNo }
    );
    const d = await res.json();
    if (d.status === 200) {
      const dup = d.data.duplicated;
      // In edit mode, the inbound's own row counts as a "match" → ignore
      if (editMode && d.data.duplicated_inbound_id === inboundId) {
        setTrackingDuplicate(false);
      } else {
        setTrackingDuplicate(dup);
      }
    }
  };

  const selectedWarehouse = warehouses.find(
    (w) => w.warehouseCode === warehouseCode
  );
  const currency = selectedWarehouse?.declared_currency ?? "JPY";
  const total = useMemo(
    () => items.reduce((s, it) => s + it.quantity * it.unit_price, 0),
    [items]
  );

  const resetForNext = (justCreatedId: string) => {
    setTrackingNo("");
    setTrackingNoOther("");
    setItems([]);
    setCustomerRemarks("");
    setRecipientName("");
    setRecipientPhone("");
    setRecipientCity("");
    setRecipientDistrict("");
    setRecipientAddress("");
    setRecipientPostal("");
    setSaveAsDefault(false);
    setError("");
    setContinueFlash({ id: justCreatedId, locale: "zh-hk" });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const submit = async (continueAfter = false) => {
    setError("");
    setContinueFlash(null);
    if (items.length === 0) {
      setError(t("inbound_v1.new.validation_no_items"));
      return;
    }
    if (
      shipmentType === "single" &&
      (!recipientName ||
        !recipientPhone ||
        !recipientCity ||
        !recipientAddress ||
        !carrierAccountId)
    ) {
      setError(t("inbound_v1.new.validation_required"));
      return;
    }
    const body: Record<string, unknown> = {
      warehouseCode,
      carrier_inbound_code: carrierInbound,
      tracking_no: trackingNo,
      inbound_source: source,
      size_estimate: sizeEstimate,
      contains_liquid: containsLiquid,
      contains_battery: containsBattery,
      shipment_type: shipmentType,
      customer_remarks: customerRemarks || undefined,
      declared_items: items.map(
        ({ draft_id: _, product_url, ...rest }) => ({
          ...rest,
          product_url: product_url || undefined,
        })
      ),
    };
    if (carrierInbound === "other" && trackingNoOther) {
      body.tracking_no_other = trackingNoOther;
    }
    if (shipmentType === "single") {
      body.single_shipping = {
        receiver_address: {
          name: recipientName,
          phone: recipientPhone,
          country_code: recipientCountry,
          city: recipientCity,
          district: recipientDistrict || undefined,
          address: recipientAddress,
          postal_code: recipientPostal || undefined,
        },
        carrier_account_id: carrierAccountId,
      };
      if (saveAsDefault) body.save_as_default_address = true;
    }

    setSubmitting(true);
    try {
      const method = editMode ? "PATCH" : "POST";
      const url = editMode
        ? `/api/cms/inbound/${inboundId}`
        : "/api/cms/inbound";
      const res = await http_request(method, url, body);
      const d = await res.json();
      if (res.ok && d.status === 200) {
        const newId = editMode ? inboundId : d.data.inbound_id;
        if (continueAfter && !editMode) {
          resetForNext(newId);
          return;
        }
        router.push(`/zh-hk/inbound/${newId}`);
        return;
      }
      if (Array.isArray(d.data)) {
        setError(
          d.data
            .map((e: any) => `${e.path?.join(".")}: ${e.message}`)
            .join("; ")
        );
      } else {
        setError(d.message || "Failed");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingMaster || loadingExisting) {
    return (
      <div className="text-center py-12">{t("common.loading")}</div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Main form — left/centre */}
        <div className="lg:col-span-2 grid gap-4">
          <Card>
            <CardHeader>
              <h2 className="text-2xl font-semibold">
                {t(editMode ? "inbound_v1.actions.edit" : "inbound_v1.new.title")}
              </h2>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FieldGroup
                label={t("inbound_v1.new.warehouse_label")}
              >
                <select
                  className="w-full border rounded px-3 py-2"
                  value={warehouseCode}
                  onChange={(e) => setWarehouseCode(e.target.value)}
                >
                  {warehouses.map((w) => (
                    <option key={w.warehouseCode} value={w.warehouseCode}>
                      {w.name_zh}
                    </option>
                  ))}
                </select>
                {selectedWarehouse && (
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedWarehouse.address_zh}
                  </p>
                )}
              </FieldGroup>

              <FieldGroup label={t("inbound_v1.new.carrier_label")}>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={carrierInbound}
                  onChange={(e) => {
                    setCarrierInbound(e.target.value);
                    setTrackingDuplicate(false);
                  }}
                >
                  <option value="">--</option>
                  {carriers.map((c) => (
                    <option
                      key={c.carrier_inbound_code}
                      value={c.carrier_inbound_code}
                    >
                      {c.name_zh}
                    </option>
                  ))}
                </select>
              </FieldGroup>

              <FieldGroup label={t("inbound_v1.new.tracking_no_label")}>
                <Input
                  value={trackingNo}
                  onChange={(e) => setTrackingNo(e.target.value)}
                  onBlur={checkDuplicate}
                />
                {trackingDuplicate && (
                  <p className="text-xs text-amber-600 mt-1">
                    {t("inbound_v1.new.tracking_no_duplicate_warning")}
                  </p>
                )}
                {carrierInbound === "other" && (
                  <div className="mt-2">
                    <Label>{t("inbound_v1.new.tracking_no_other_label")}</Label>
                    <Input
                      value={trackingNoOther}
                      onChange={(e) => setTrackingNoOther(e.target.value)}
                    />
                  </div>
                )}
              </FieldGroup>

              <FieldGroup label={t("inbound_v1.new.inbound_source_label")}>
                <div className="flex gap-2 flex-wrap">
                  {(["regular", "return", "gift", "other"] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant={source === s ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSource(s)}
                    >
                      {t(`inbound_v1.inbound_source.${s}` as any)}
                    </Button>
                  ))}
                </div>
              </FieldGroup>

              <FieldGroup label={t("inbound_v1.new.size_estimate_label")}>
                <div className="grid grid-cols-3 gap-2">
                  {(["small", "medium", "large"] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant={sizeEstimate === s ? "default" : "outline"}
                      onClick={() => setSizeEstimate(s)}
                      className="flex flex-col items-start h-auto py-2"
                    >
                      <span className="font-semibold">
                        {t(`inbound_v1.size_estimate.${s}` as any)}
                      </span>
                      <span className="text-xs opacity-70">
                        {t(`inbound_v1.new.size_${s}_hint` as any)}
                      </span>
                    </Button>
                  ))}
                </div>
              </FieldGroup>

              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label={t("inbound_v1.new.contains_liquid_label")}>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={containsLiquid ? "default" : "outline"}
                      onClick={() => setContainsLiquid(true)}
                    >
                      {t("inbound_v1.new.yes")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!containsLiquid ? "default" : "outline"}
                      onClick={() => setContainsLiquid(false)}
                    >
                      {t("inbound_v1.new.no")}
                    </Button>
                  </div>
                </FieldGroup>
                <FieldGroup label={t("inbound_v1.new.contains_battery_label")}>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={containsBattery ? "default" : "outline"}
                      onClick={() => setContainsBattery(true)}
                    >
                      {t("inbound_v1.new.yes")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!containsBattery ? "default" : "outline"}
                      onClick={() => setContainsBattery(false)}
                    >
                      {t("inbound_v1.new.no")}
                    </Button>
                  </div>
                </FieldGroup>
              </div>

              <FieldGroup label={t("inbound_v1.new.shipment_type_label")}>
                <div className="grid grid-cols-2 gap-2">
                  {(["consolidated", "single"] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant={shipmentType === s ? "default" : "outline"}
                      onClick={() => setShipmentType(s)}
                      className="flex flex-col items-start h-auto py-2"
                    >
                      <span className="font-semibold">
                        {t(`inbound_v1.shipment_type.${s}` as any)}
                      </span>
                      <span className="text-xs opacity-70">
                        {t(`inbound_v1.new.${s}_hint` as any)}
                      </span>
                    </Button>
                  ))}
                </div>
              </FieldGroup>

              {shipmentType === "single" && (
                <div className="grid gap-3 rounded-md border p-4 bg-gray-50">
                  <h3 className="font-semibold">
                    {t("inbound_v1.new.receiver_address_label")}
                  </h3>
                  {/* Saved-address picker — hydrate the entire receiver
                      block in one click. The "manage" link opens the
                      address-book in a new tab. */}
                  <div className="flex items-center gap-2 mb-2 text-sm">
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
                        setRecipientName(a.name);
                        setRecipientPhone(a.phone);
                        setRecipientCountry(a.country_code);
                        setRecipientCity(a.city);
                        setRecipientDistrict(a.district ?? "");
                        setRecipientAddress(a.address);
                        setRecipientPostal(a.postal_code ?? "");
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
                    <Link
                      href="/zh-hk/addresses"
                      target="_blank"
                      className="text-blue-600 text-xs whitespace-nowrap"
                    >
                      {t("addresses.picker_manage")}
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Name"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                    />
                    {/* Phone with dial-code prefix derived from country */}
                    <div className="flex">
                      <span className="inline-flex items-center px-2 border border-r-0 rounded-l bg-gray-50 text-sm text-gray-600 whitespace-nowrap">
                        {DIAL_CODES[recipientCountry] ?? "+"}
                      </span>
                      <Input
                        placeholder="Phone (no country code)"
                        className="rounded-l-none"
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(e.target.value)}
                      />
                    </div>
                    <select
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={recipientCountry}
                      onChange={(e) => {
                        setRecipientCountry(e.target.value);
                        // Reset HK-specific district picks when leaving HK
                        if (e.target.value !== "HK") {
                          setRecipientDistrict("");
                        }
                      }}
                    >
                      {Object.keys(DIAL_CODES).map((code) => (
                        <option key={code} value={code}>
                          {code} ({DIAL_CODES[code]})
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder="City"
                      value={recipientCity}
                      onChange={(e) => setRecipientCity(e.target.value)}
                    />
                    {recipientCountry === "HK" ? (
                      <select
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={recipientDistrict}
                        onChange={(e) => setRecipientDistrict(e.target.value)}
                      >
                        <option value="">區域 (選填)</option>
                        {HK_DISTRICTS.map((d) => (
                          <option key={d.code} value={d.zh}>
                            {d.zh}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        placeholder="District (optional)"
                        value={recipientDistrict}
                        onChange={(e) => setRecipientDistrict(e.target.value)}
                      />
                    )}
                    <Input
                      placeholder="Postal code (optional)"
                      value={recipientPostal}
                      onChange={(e) => setRecipientPostal(e.target.value)}
                    />
                  </div>
                  <Input
                    placeholder="Detailed address"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                  />
                  <FieldGroup
                    label={t("inbound_v1.new.carrier_account_label")}
                  >
                    {carrierAccounts.length === 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-amber-700">
                          {t("inbound_v1.new.no_carrier_account_warning")}
                        </span>
                        <Link
                          href="/zh-hk/carrier-accounts/new"
                          className="underline text-blue-600 text-sm"
                        >
                          {t("inbound_v1.new.go_link_carrier_account")}
                        </Link>
                      </div>
                    ) : (
                      <select
                        className="w-full border rounded px-3 py-2"
                        value={carrierAccountId}
                        onChange={(e) => setCarrierAccountId(e.target.value)}
                      >
                        <option value="">--</option>
                        {carrierAccounts.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.nickname} ({a.carrier_code})
                          </option>
                        ))}
                      </select>
                    )}
                  </FieldGroup>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="save_default"
                      checked={saveAsDefault}
                      onCheckedChange={(v) => setSaveAsDefault(v === true)}
                    />
                    <Label htmlFor="save_default" className="font-normal">
                      {t("inbound_v1.new.save_as_default_address")}
                    </Label>
                  </div>
                </div>
              )}

              <FieldGroup label={t("inbound_v1.new.customer_remarks_label")}>
                <Textarea
                  rows={2}
                  maxLength={200}
                  placeholder={t("inbound_v1.new.customer_remarks_placeholder")}
                  value={customerRemarks}
                  onChange={(e) => setCustomerRemarks(e.target.value)}
                />
              </FieldGroup>

              {error && (
                <p className="text-red-500 text-sm" role="alert">
                  {error}
                </p>
              )}
              {continueFlash && (
                <div className="text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 rounded p-3 flex items-center justify-between gap-3">
                  <span>
                    {t.rich("inbound_v1.new.continue_success", {
                      id: continueFlash.id,
                      link: (chunks) => (
                        <Link
                          href={`/${continueFlash.locale}/inbound/${continueFlash.id}`}
                          className="underline font-mono"
                        >
                          {chunks}
                        </Link>
                      ),
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setContinueFlash(null)}
                    className="text-xs text-emerald-700 hover:underline"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Link href="/zh-hk/inbound/list">
                  <Button variant="outline" type="button">
                    {t("inbound_v1.new.back")}
                  </Button>
                </Link>
                <Button
                  type="button"
                  onClick={() => submit(false)}
                  disabled={
                    submitting ||
                    !warehouseCode ||
                    !carrierInbound ||
                    !trackingNo ||
                    items.length === 0
                  }
                >
                  {submitting
                    ? t("inbound_v1.new.submitting")
                    : t("inbound_v1.new.submit")}
                </Button>
                {!editMode && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => submit(true)}
                    disabled={
                      submitting ||
                      !warehouseCode ||
                      !carrierInbound ||
                      !trackingNo ||
                      items.length === 0
                    }
                  >
                    {t("inbound_v1.new.submit_and_continue")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Items drawer — right */}
        <div className="grid gap-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="text-lg font-semibold">
                {t("inbound_v1.new.items_panel_title")}
              </h3>
              <Button
                size="sm"
                onClick={() => {
                  setItemDrafts([blankItem()]);
                  setItemModalOpen(true);
                }}
              >
                {t("inbound_v1.new.add_item_btn")}
              </Button>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  {t("inbound_v1.new.no_items_yet")}
                </p>
              ) : (
                <div className="grid gap-2">
                  {items.map((it, idx) => {
                    const cat = categories.find(
                      (c) => c._id === it.category_id
                    );
                    const sub = cat?.subcategories.find(
                      (s) => s._id === it.subcategory_id
                    );
                    return (
                      <div
                        key={it.draft_id}
                        className="rounded-md border p-3"
                      >
                        <div className="font-medium">{it.product_name}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {cat?.name_zh ?? it.category_id} ›{" "}
                          {sub?.name_zh ?? it.subcategory_id}
                        </div>
                        <div className="text-sm mt-1">
                          {it.quantity} × {currency}{" "}
                          {it.unit_price.toLocaleString()} ={" "}
                          <span className="font-semibold">
                            {currency}{" "}
                            {(it.quantity * it.unit_price).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex gap-1 mt-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setItemDrafts([{ ...it }]);
                              setItemModalOpen(true);
                            }}
                          >
                            {t("inbound_v1.new.item_modal.edit_title")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() =>
                              setItems(items.filter((x) => x.draft_id !== it.draft_id))
                            }
                          >
                            {t("inbound_v1.new.item_modal.delete_btn")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="border-t pt-2 flex justify-between">
                    <span className="font-semibold">
                      {t("inbound_v1.new.item_total")}
                    </span>
                    <span className="font-semibold">
                      {currency} {total.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Item modal */}
      <ItemModal
        open={itemModalOpen}
        onOpenChange={setItemModalOpen}
        drafts={itemDrafts}
        categories={categories}
        currency={currency}
        onSave={(saved) => {
          setItems((prev) => {
            const next = [...prev];
            saved.forEach((s) => {
              const idx = next.findIndex((p) => p.draft_id === s.draft_id);
              if (idx >= 0) next[idx] = s;
              else next.push(s);
            });
            return next;
          });
          setItemModalOpen(false);
          setItemDrafts([]);
        }}
        onCancel={() => {
          setItemModalOpen(false);
          setItemDrafts([]);
        }}
      />
    </div>
  );
};

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ItemModal({
  open,
  onOpenChange,
  drafts,
  categories,
  currency,
  onSave,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  drafts: ItemDraft[];
  categories: Category[];
  currency: string;
  onSave: (items: ItemDraft[]) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const blankRow = (): ItemDraft => ({
    draft_id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    category_id: "",
    subcategory_id: "",
    product_name: "",
    product_url: "",
    quantity: 1,
    unit_price: 0,
  });
  const [rows, setRows] = useState<ItemDraft[]>([]);

  // Sync incoming drafts → local rows whenever the modal opens. Local
  // edits are isolated until "Save" so cancel cleanly discards them.
  useEffect(() => {
    if (open) {
      setRows(
        drafts.length > 0
          ? drafts.map((d) => ({ ...d }))
          : [blankRow()]
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isBlank = (r: ItemDraft) =>
    !r.category_id &&
    !r.subcategory_id &&
    !r.product_name &&
    !r.product_url &&
    !r.unit_price &&
    (r.quantity === 1 || !r.quantity);

  const isValid = (r: ItemDraft) =>
    !!r.category_id &&
    !!r.subcategory_id &&
    !!r.product_name &&
    r.quantity >= 1 &&
    r.unit_price >= 0;

  const filledRows = rows.filter((r) => !isBlank(r));
  const canSave =
    filledRows.length > 0 && filledRows.every(isValid);
  const total = filledRows.reduce(
    (s, r) => s + r.quantity * r.unit_price,
    0
  );

  const patchRow = (id: string, patch: Partial<ItemDraft>) =>
    setRows((prev) =>
      prev.map((r) => (r.draft_id === id ? { ...r, ...patch } : r))
    );
  const removeRow = (id: string) =>
    setRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.draft_id !== id) : prev
    );
  const addRow = () => setRows((prev) => [...prev, blankRow()]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("inbound_v1.new.item_modal.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-medium p-2 w-[14%]">
                    {t("inbound_v1.new.item_modal.category_label")}
                  </th>
                  <th className="text-left font-medium p-2 w-[14%]">
                    {t("inbound_v1.new.item_modal.subcategory_label")}
                  </th>
                  <th className="text-left font-medium p-2">
                    {t("inbound_v1.new.item_modal.product_name_label")}
                  </th>
                  <th className="text-left font-medium p-2 w-[9%]">
                    {t("inbound_v1.new.item_modal.quantity_label")}
                  </th>
                  <th className="text-left font-medium p-2 w-[12%]">
                    {t("inbound_v1.new.item_modal.unit_price_label")} (
                    {currency})
                  </th>
                  <th className="text-right font-medium p-2 w-[11%]">
                    {t("inbound_v1.new.item_modal.subtotal_label")}
                  </th>
                  <th className="p-2 w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cat = categories.find(
                    (c) => c._id === r.category_id
                  );
                  const rowSubtotal = r.quantity * r.unit_price;
                  const rowError = !isBlank(r) && !isValid(r);
                  return (
                    <tr
                      key={r.draft_id}
                      className={`border-t ${rowError ? "bg-red-50" : ""}`}
                    >
                      <td className="p-2 align-top">
                        <select
                          className="w-full border rounded px-2 py-1.5"
                          value={r.category_id}
                          onChange={(e) =>
                            patchRow(r.draft_id, {
                              category_id: e.target.value,
                              subcategory_id: "",
                            })
                          }
                        >
                          <option value="">
                            {t(
                              "inbound_v1.new.item_modal.select_category"
                            )}
                          </option>
                          {categories.map((c) => (
                            <option key={c._id} value={c._id}>
                              {c.name_zh}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 align-top">
                        <select
                          className="w-full border rounded px-2 py-1.5"
                          value={r.subcategory_id}
                          onChange={(e) =>
                            patchRow(r.draft_id, {
                              subcategory_id: e.target.value,
                            })
                          }
                          disabled={!cat}
                        >
                          <option value="">
                            {cat
                              ? t(
                                  "inbound_v1.new.item_modal.select_category"
                                )
                              : t(
                                  "inbound_v1.new.item_modal.select_subcategory"
                                )}
                          </option>
                          {cat?.subcategories.map((s) => (
                            <option key={s._id} value={s._id}>
                              {s.name_zh}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 align-top">
                        <div className="grid gap-1">
                          <Input
                            value={r.product_name}
                            placeholder={t(
                              "inbound_v1.new.item_modal.product_name_label"
                            )}
                            onChange={(e) =>
                              patchRow(r.draft_id, {
                                product_name: e.target.value,
                              })
                            }
                            maxLength={200}
                          />
                          <Input
                            type="url"
                            value={r.product_url}
                            placeholder="https://..."
                            onChange={(e) =>
                              patchRow(r.draft_id, {
                                product_url: e.target.value,
                              })
                            }
                          />
                        </div>
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={
                            r.quantity === 1 ? "" : r.quantity || ""
                          }
                          placeholder="1"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            patchRow(r.draft_id, {
                              quantity:
                                parseInt(e.target.value, 10) || 1,
                            })
                          }
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={r.unit_price || ""}
                          placeholder="0"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            patchRow(r.draft_id, {
                              unit_price:
                                parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td className="p-2 align-top text-right whitespace-nowrap font-medium">
                        {currency} {rowSubtotal.toLocaleString()}
                      </td>
                      <td className="p-2 align-top">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 h-9 w-9 p-0"
                          onClick={() => removeRow(r.draft_id)}
                          disabled={rows.length === 1}
                          aria-label={t(
                            "inbound_v1.new.item_modal.delete_btn"
                          )}
                          title={t(
                            "inbound_v1.new.item_modal.delete_btn"
                          )}
                        >
                          ✕
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center pt-1">
            <Button variant="outline" size="sm" onClick={addRow}>
              {t("inbound_v1.new.add_item_btn")}
            </Button>
            <div className="text-sm">
              <span className="text-gray-600 mr-2">
                {t("inbound_v1.new.item_total")}
              </span>
              <span className="font-semibold">
                {currency} {total.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("inbound_v1.new.item_modal.cancel_btn")}
          </Button>
          <Button
            onClick={() => canSave && onSave(filledRows)}
            disabled={!canSave}
          >
            {t("inbound_v1.new.item_modal.save_btn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

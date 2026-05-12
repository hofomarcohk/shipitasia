"use client";
import { SectionCard } from "@/components/section-card";
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
  /** Per the v0.3 item-dialog redesign: by default every row silently
   *  upserts into the customer's saved-item library by product_name. This
   *  flag lets the customer opt-out per row (rare). */
  opt_out_library?: boolean;
}

interface SavedItem {
  _id: string;
  category_id: string;
  subcategory_id: string;
  product_name: string;
  product_url: string | null;
  default_quantity: number;
  default_unit_price: number;
  used_count: number;
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

  // ── P10 redesign · saved-items library + apply-last-inbound ──
  interface AppliedFromInbound {
    inbound_id: string;
    applied: Array<"package_attrs" | "recipient" | "carrier_account" | "items">;
  }
  const [savedItemPool, setSavedItemPool] = useState<SavedItem[]>([]);
  // draft_id → saved_item_id : which rows came from the library (so the
  const [applied, setApplied] = useState<AppliedFromInbound | null>(null);
  // Post-submit toast surface for the silent library upsert/inserts.
  const [libraryToast, setLibraryToast] = useState<string | null>(null);

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

  // ── Apply latest inbound (new-mode only). Pre-fills package attrs +
  //    recipient + carrier_account + items from the customer's most recent
  //    inbound. Skips tracking_no (OQ-1: each new inbound has fresh
  //    tracking). Skips when in edit mode (the inbound being edited is
  //    the source of truth).
  useEffect(() => {
    if (editMode || loadingMaster) return;
    (async () => {
      const r = await http_request("GET", "/api/cms/inbound/latest", {});
      const dd = await r.json();
      if (dd.status !== 200 || !dd.data) return;
      const inb = dd.data.inbound;
      const declared = dd.data.declared_items ?? [];
      // package attrs
      if (inb.warehouseCode) setWarehouseCode(inb.warehouseCode);
      if (inb.carrier_inbound_code) setCarrierInbound(inb.carrier_inbound_code);
      setSource(inb.inbound_source);
      setSizeEstimate(inb.size_estimate);
      setContainsLiquid(inb.contains_liquid);
      setContainsBattery(inb.contains_battery);
      setShipmentType(inb.shipment_type);
      // tracking_no is intentionally NOT copied — every inbound has its own.
      // recipient + carrier_account
      const appliedKinds: AppliedFromInbound["applied"] = ["package_attrs"];
      if (inb.shipment_type === "single" && inb.single_shipping) {
        const a = inb.single_shipping.receiver_address;
        setRecipientName(a.name);
        setRecipientPhone(a.phone);
        setRecipientCountry(a.country_code);
        setRecipientCity(a.city);
        setRecipientDistrict(a.district ?? "");
        setRecipientAddress(a.address);
        setRecipientPostal(a.postal_code ?? "");
        setCarrierAccountId(inb.single_shipping.carrier_account_id);
        appliedKinds.push("recipient", "carrier_account");
      }
      // items
      if (declared.length > 0) {
        setItems(
          declared.map((d: any, i: number) => ({
            draft_id: `applied_${i}_${Date.now()}`,
            category_id: d.category_id,
            subcategory_id: d.subcategory_id,
            product_name: d.product_name,
            product_url: d.product_url ?? "",
            quantity: d.quantity,
            unit_price: d.unit_price,
          }))
        );
        appliedKinds.push("items");
      }
      setApplied({ inbound_id: inb._id, applied: appliedKinds });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, loadingMaster]);

  // Load saved-items pool once for the picker drawer (no need to re-fetch
  // on every keystroke — small/medium catalog, filter in-memory).
  useEffect(() => {
    if (editMode) return;
    (async () => {
      const r = await http_request(
        "GET",
        "/api/cms/saved-items?sort=used",
        {}
      );
      const d = await r.json();
      if (d.status === 200) setSavedItemPool(d.data ?? []);
    })();
  }, [editMode]);

  // Reset every form field to a blank slate when the customer clicks
  // "清空" on the apply-banner.
  const clearApplied = () => {
    setApplied(null);
    setWarehouseCode(warehouses[0]?.warehouseCode ?? "");
    setCarrierInbound("");
    setTrackingNo("");
    setTrackingNoOther("");
    setTrackingDuplicate(false);
    setSource("regular");
    setSizeEstimate("medium");
    setContainsLiquid(false);
    setContainsBattery(false);
    setShipmentType("consolidated");
    setRecipientName("");
    setRecipientPhone("");
    setRecipientCountry("HK");
    setRecipientCity("");
    setRecipientDistrict("");
    setRecipientAddress("");
    setRecipientPostal("");
    setCarrierAccountId("");
    setSavedAddressId("");
    setSaveAsDefault(false);
    setItems([]);
    setCustomerRemarks("");
    setError("");
  };

  // Normalize product name client-side using the same NFKC + casefold
  // recipe as the server's saved-item upsert. Used by the item-dialog
  // chip computation so the UI labels match the server's commit decision.
  const normalizeName = (raw: string): string =>
    raw.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

  const savedItemByName = useMemo(() => {
    const m = new Map<string, SavedItem>();
    for (const s of savedItemPool) {
      const k = normalizeName(s.product_name);
      if (k) m.set(k, s);
    }
    return m;
  }, [savedItemPool]);

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
        ({ draft_id: _, product_url, opt_out_library, ...rest }) => ({
          ...rest,
          product_url: product_url || undefined,
          ...(opt_out_library ? { opt_out_library: true } : {}),
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
        // Server returns `library_changes` describing every silent upsert
        // it did. Format a toast so the customer sees what was learned.
        const changes: Array<{ product_name: string; action: string }> =
          d.data?.library_changes ?? [];
        if (changes.length > 0) {
          const u = changes.filter((c) => c.action === "updated").length;
          const c = changes.filter((c) => c.action === "created").length;
          const parts: string[] = [];
          if (u > 0) parts.push(`更新 ${u} 件`);
          if (c > 0) parts.push(`新增 ${c} 件`);
          setLibraryToast(`品項庫已${parts.join(" · ")}`);
        }
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

  // ── Section completion derived from validated fields. The form is a
  //    4-section "漸進解鎖" flow per the v2 design — sections lock until
  //    the previous one is valid, but the user can always click ✎ on a
  //    done section to re-expand it.
  const s1Complete =
    !!warehouseCode &&
    !!carrierInbound &&
    !!trackingNo &&
    !trackingDuplicate &&
    (carrierInbound !== "other" || !!trackingNoOther);
  const s2Complete = items.length >= 1;
  const s3Complete =
    shipmentType !== "single" ||
    (!!recipientName &&
      !!recipientPhone &&
      !!recipientCity &&
      !!recipientAddress &&
      !!carrierAccountId);
  const sectionList = shipmentType === "single" ? [1, 2, 3, 4] : [1, 2, 4];
  const completes: Record<number, boolean> = {
    1: s1Complete,
    2: s2Complete,
    3: s3Complete,
    4: false,
  };
  const sectionStatus = (n: number): "editing" | "done" | "locked" => {
    const idx = sectionList.indexOf(n);
    if (idx === -1) return "locked";
    const prev = idx === 0 ? null : sectionList[idx - 1];
    if (prev !== null && !completes[prev]) return "locked";
    if (completes[n]) return "done";
    return "editing";
  };
  const finalSection = sectionList[sectionList.length - 1];
  const canSubmit =
    !submitting && s1Complete && s2Complete && s3Complete;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      {/* Apply-from-last-inbound banner (new mode only). Lists what was
          pulled in and explicitly calls out tracking_no as NOT applied. */}
      {!editMode && applied && (
        <div className="mb-4 rounded-md border bg-blue-50 border-blue-200 px-4 py-3 text-sm text-blue-900 flex items-start gap-3">
          <span className="text-base leading-tight">📌</span>
          <div className="flex-1">
            <div>
              <b>{t("inbound_v1.new.applied_banner_title")}</b>
              {" — "}
              {applied.applied
                .map((k) => t(`inbound_v1.new.applied_kind.${k}` as any))
                .join(" · ")}
            </div>
            <div className="text-amber-700 text-xs mt-1">
              ⚠ {t("inbound_v1.new.applied_banner_skip_tracking")}
            </div>
          </div>
          <button
            type="button"
            className="text-blue-700 underline text-xs"
            onClick={clearApplied}
          >
            {t("inbound_v1.new.applied_clear")}
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_220px] gap-6">
        <div className="grid gap-4 min-w-0">
          <h1 className="text-2xl font-semibold">
            {t(editMode ? "inbound_v1.actions.edit" : "inbound_v1.new.title")}
          </h1>

          {/* ── Section 1 · 包裹屬性 ── */}
          <SectionCard
            n={1}
            title={t("inbound_v1.new.section1_title")}
            status={sectionStatus(1)}
          >
            <div className="grid gap-4">
              <div className="grid md:grid-cols-2 gap-3 items-start">
                <FieldGroup label={t("inbound_v1.new.warehouse_label")}>
                  <select
                    className="w-full border rounded h-10 px-3 text-sm bg-white"
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
                    className="w-full border rounded h-10 px-3 text-sm bg-white"
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
              </div>

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
            </div>
          </SectionCard>

          {/* ── Section 2 · 申報品項 ── */}
          <SectionCard
            n={2}
            title={t("inbound_v1.new.section2_title")}
            status={sectionStatus(2)}
            headerActions={
              <Button
                size="sm"
                onClick={() => {
                  setItemDrafts([blankItem()]);
                  setItemModalOpen(true);
                }}
              >
                {t("inbound_v1.new.add_item_btn")}
              </Button>
            }
          >
            <div className="grid gap-3">
              {/* Items list */}
              {items.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  {t("inbound_v1.new.no_items_yet")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left p-2 w-[18%]">
                          {t("inbound_v1.new.item_modal.category_label")}
                        </th>
                        <th className="text-left p-2">
                          {t("inbound_v1.new.item_modal.product_name_label")}
                        </th>
                        <th className="text-right p-2 w-[8%]">數量</th>
                        <th className="text-right p-2 w-[12%]">
                          {t("inbound_v1.new.item_modal.unit_price_label")} ({currency})
                        </th>
                        <th className="text-right p-2 w-[12%]">
                          {t("inbound_v1.new.item_modal.subtotal_label")}
                        </th>
                        <th className="p-2 w-[120px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => {
                        const cat = categories.find(
                          (c) => c._id === it.category_id
                        );
                        const sub = cat?.subcategories.find(
                          (s) => s._id === it.subcategory_id
                        );
                        // Lineage chip per v0.3 redesign: 📚 if the name
                        // hits a saved-item (commit will upsert defaults);
                        // ＋ if it's a new name (commit will insert).
                        const nameKey = normalizeName(it.product_name);
                        const inLib = nameKey && savedItemByName.has(nameKey);
                        return (
                          <tr key={it.draft_id} className="border-t">
                            <td className="p-2 align-top">
                              <div>{cat?.name_zh ?? it.category_id}</div>
                              <div className="text-xs text-gray-500">
                                {sub?.name_zh ?? it.subcategory_id}
                              </div>
                            </td>
                            <td className="p-2 align-top">
                              <div className="font-medium">{it.product_name}</div>
                              <div className="text-xs mt-0.5">
                                <span
                                  className={
                                    inLib
                                      ? "text-gray-600 font-mono"
                                      : it.opt_out_library
                                      ? "text-gray-400 font-mono"
                                      : "text-blue-700 font-mono"
                                  }
                                >
                                  {inLib
                                    ? "📚 已存品項"
                                    : it.opt_out_library
                                    ? "＋ 全新 · 一次性（不入庫）"
                                    : "＋ 全新 · 將入庫"}
                                </span>
                              </div>
                            </td>
                            <td className="p-2 align-top text-right">
                              {it.quantity}
                            </td>
                            <td className="p-2 align-top text-right">
                              {it.unit_price.toLocaleString()}
                            </td>
                            <td className="p-2 align-top text-right font-semibold">
                              {(it.quantity * it.unit_price).toLocaleString()}
                            </td>
                            <td className="p-2 align-top text-right whitespace-nowrap">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setItemDrafts([{ ...it }]);
                                  setItemModalOpen(true);
                                }}
                              >
                                ✎
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600"
                                onClick={() => {
                                  setItems(
                                    items.filter(
                                      (x) => x.draft_id !== it.draft_id
                                    )
                                  );
                                }}
                              >
                                ×
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="flex justify-between items-center pt-2 border-t mt-2">
                    <span className="text-sm text-gray-500">
                      {t("inbound_v1.new.item_total")}
                    </span>
                    <span className="font-semibold">
                      {currency} {total.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── Section 3 · 收件人 + Carrier (single only) ── */}
          {shipmentType === "single" && (
            <SectionCard
              n={3}
              title={t("inbound_v1.new.section3_title")}
              status={sectionStatus(3)}
            >
              <div className="grid gap-3">
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
            </SectionCard>
          )}

          {/* ── Section 4 · 備註 + 確認 ── */}
          <SectionCard
            n={finalSection}
            title={t("inbound_v1.new.section4_title")}
            status={sectionStatus(finalSection)}
          >
            <div className="grid gap-3">
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
              {libraryToast && (
                <div className="text-sm bg-blue-50 text-blue-800 border border-blue-200 rounded p-3 flex items-center justify-between gap-3">
                  <span>📚 {libraryToast}</span>
                  <button
                    type="button"
                    onClick={() => setLibraryToast(null)}
                    className="text-xs hover:underline"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex gap-2 pt-2 flex-wrap">
                <Link href="/zh-hk/inbound/list">
                  <Button variant="outline" type="button">
                    {t("inbound_v1.new.back")}
                  </Button>
                </Link>
                <Button
                  type="button"
                  onClick={() => submit(false)}
                  disabled={!canSubmit}
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
                    disabled={!canSubmit}
                  >
                    {t("inbound_v1.new.submit_and_continue")}
                  </Button>
                )}
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
            {sectionList.map((n, i) => {
              const status = sectionStatus(n);
              const labelKey: Record<number, string> = {
                1: "inbound_v1.new.section1_title",
                2: "inbound_v1.new.section2_title",
                3: "inbound_v1.new.section3_title",
                4: "inbound_v1.new.section4_title",
              };
              return (
                <div
                  key={n}
                  className={`flex gap-2 items-start p-2 rounded ${
                    status === "editing"
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
                        : status === "editing"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-300 text-gray-600"
                    }`}
                  >
                    {status === "done" ? "✓" : i + 1}
                  </div>
                  <div className="text-xs leading-tight pt-0.5">
                    <div className="font-medium">{t(labelKey[n] as any)}</div>
                    <div className="text-gray-500">
                      {status === "done"
                        ? t("inbound_v1.new.stepper_done")
                        : status === "locked"
                        ? t("inbound_v1.new.stepper_locked")
                        : t("inbound_v1.new.stepper_active")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Item modal */}
      <ItemModal
        open={itemModalOpen}
        onOpenChange={setItemModalOpen}
        drafts={itemDrafts}
        categories={categories}
        currency={currency}
        savedItemPool={savedItemPool}
        onSave={(saved) => {
          setItems((prev) => {
            // Replace the whole items list with the modal's filtered rows
            // when the modal was opened fresh (no incoming drafts), or
            // patch-in by draft_id when editing a single existing row.
            // Drafts always carry their original draft_id, so a merge by
            // draft_id covers both flows.
            const next = [...prev];
            const seen = new Set<string>();
            saved.forEach((s) => {
              seen.add(s.draft_id);
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

// ─────────────────────────────────────────────────────────────────────
// ItemModal — v0.3 redesign per item-dialog-redesign.html
//
// Mental model: product_name = library identifier. Two row lineages,
// computed at render time from a name-keyed lookup:
//
//   📚 LIB  — normalize(name) hits a saved-item. Commit silently upserts
//             (overwrites the saved-item's default qty/price).
//   ＋ NEW  — name doesn't hit anything. Commit silently inserts as a
//             new saved-item, unless the row has opt_out_library set.
//
// No save-banner, no batch-confirm modal, no "save-to-library" button.
// The shelf at the top is the only entry point besides 「＋ 手動加」, and
// its ＋ button never disables — re-picking the same item adds another
// independent row (same name → still 📚; commit applies the latest).
// ─────────────────────────────────────────────────────────────────────
function ItemModal({
  open,
  onOpenChange,
  drafts,
  categories,
  currency,
  savedItemPool,
  onSave,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  drafts: ItemDraft[];
  categories: Category[];
  currency: string;
  savedItemPool: SavedItem[];
  onSave: (items: ItemDraft[]) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const normalizeName = (raw: string): string =>
    raw.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

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
  const [shelfSearch, setShelfSearch] = useState("");

  useEffect(() => {
    if (open) {
      setRows(
        drafts.length > 0
          ? drafts.map((d) => ({ ...d }))
          : [blankRow()]
      );
      setShelfSearch("");
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
  const canSave = filledRows.length > 0 && filledRows.every(isValid);
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

  // Build the normalize-name → saved-item map so chip computation +
  // shelf "在單內 ×N" counts stay in sync.
  const libByName = new Map<string, SavedItem>();
  for (const s of savedItemPool) {
    const k = normalizeName(s.product_name);
    if (k) libByName.set(k, s);
  }
  const lineageOf = (r: ItemDraft): "lib" | "new" => {
    if (!r.product_name) return "new";
    return libByName.has(normalizeName(r.product_name)) ? "lib" : "new";
  };
  const inListCount = (s: SavedItem) => {
    const k = normalizeName(s.product_name);
    return rows.filter(
      (r) => r.product_name && normalizeName(r.product_name) === k
    ).length;
  };

  const filteredShelf = (
    shelfSearch.trim()
      ? savedItemPool.filter((s) =>
          s.product_name
            .toLowerCase()
            .includes(shelfSearch.trim().toLowerCase())
        )
      : savedItemPool
  ).slice(0, 12);

  const addFromShelf = (s: SavedItem) => {
    const newRow: ItemDraft = {
      draft_id: `lib_${s._id}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 5)}`,
      category_id: s.category_id,
      subcategory_id: s.subcategory_id,
      product_name: s.product_name,
      product_url: s.product_url ?? "",
      quantity: s.default_quantity,
      unit_price: s.default_unit_price,
    };
    setRows((prev) => {
      // Replace the placeholder blank row if that's all we have so far.
      if (prev.length === 1 && isBlank(prev[0])) return [newRow];
      return [...prev, newRow];
    });
  };

  const addManual = () => setRows((prev) => [...prev, blankRow()]);

  const catName = (s: SavedItem) =>
    categories.find((c) => c._id === s.category_id)?.name_zh ?? "";

  // Show "row 是預設 placeholder + 完全空" state for the empty-state visual.
  const isEmptyState = rows.length === 1 && isBlank(rows[0]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>
            {t("inbound_v1.new.item_modal.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 grid gap-4">
          {/* ── Shelf ── */}
          {savedItemPool.length > 0 && (
            <div className="border rounded-lg bg-gradient-to-b from-gray-50 to-white p-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-md bg-gray-900 text-white grid place-items-center text-sm">
                  📚
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">
                    {t("saved_items.picker_title")}
                  </div>
                  <div className="text-xs text-gray-500">
                    {savedItemPool.length} 件已存 · 按 ＋ 加入下面申報單
                  </div>
                </div>
                <Input
                  placeholder={t("saved_items.picker_search_placeholder")}
                  value={shelfSearch}
                  onChange={(e) => setShelfSearch(e.target.value)}
                  className="max-w-xs h-9 bg-white"
                />
              </div>
              {filteredShelf.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">
                  無匹配品項
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {filteredShelf.map((s) => {
                    const cnt = inListCount(s);
                    const inList = cnt > 0;
                    return (
                      <div
                        key={s._id}
                        className={`border rounded-md p-2.5 flex items-center gap-3 ${
                          inList
                            ? "bg-emerald-50 border-emerald-300"
                            : "bg-white"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {s.product_name}
                          </div>
                          <div
                            className={`text-xs font-mono ${
                              inList ? "text-emerald-700" : "text-gray-500"
                            }`}
                          >
                            {inList
                              ? `在單內 ×${cnt} · 再加`
                              : `${catName(s)} · ${currency} ${s.default_unit_price.toLocaleString()} · ${s.used_count} 次`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addFromShelf(s)}
                          className={`flex-none w-7 h-7 rounded-full grid place-items-center text-sm shadow-sm transition hover:scale-105 ${
                            inList
                              ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                              : "bg-gray-900 text-white"
                          }`}
                          aria-label="加入"
                        >
                          ＋
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Declared rows ── */}
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <h3 className="text-sm font-semibold">申報品項</h3>
              <span className="text-xs font-mono text-gray-500">
                {filledRows.length} 件 · {currency} {total.toLocaleString()}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={addManual}
              >
                ＋ 手動加（不在庫）
              </Button>
            </div>

            {isEmptyState && savedItemPool.length > 0 ? (
              <div className="border-2 border-dashed rounded-md p-8 text-center bg-gray-50 text-gray-500 text-sm">
                <div className="text-2xl mb-2">↑</div>
                在品項庫選 (＋) 或按右上「手動加」開新一項
              </div>
            ) : (
              <div className="grid gap-2">
                {rows.map((r) => {
                  const cat = categories.find(
                    (c) => c._id === r.category_id
                  );
                  const lineage = lineageOf(r);
                  const matched = lineage === "lib"
                    ? libByName.get(normalizeName(r.product_name))
                    : null;
                  const priceDiffers =
                    matched && matched.default_unit_price !== r.unit_price;
                  const rowSubtotal = r.quantity * r.unit_price;
                  const rowError = !isBlank(r) && !isValid(r);
                  return (
                    <div
                      key={r.draft_id}
                      className={`border rounded-md p-3 ${
                        rowError ? "bg-red-50 border-red-200" : "bg-white"
                      } ${lineage === "new" ? "border-l-4 border-l-gray-900" : ""}`}
                    >
                      <div className="grid grid-cols-[32px_minmax(0,1fr)_72px_104px_96px_36px] gap-3 items-start">
                        {/* lineage chip */}
                        <div
                          className={`w-7 h-7 rounded-md grid place-items-center text-sm ${
                            lineage === "lib"
                              ? "bg-gray-900 text-white"
                              : "bg-gray-100 text-gray-700 border border-dashed"
                          }`}
                          title={lineage === "lib" ? "同名命中庫" : "新名"}
                        >
                          {lineage === "lib" ? "📚" : "＋"}
                        </div>

                        {/* who */}
                        <div className="min-w-0 grid gap-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Input
                              value={r.product_name}
                              onChange={(e) =>
                                patchRow(r.draft_id, {
                                  product_name: e.target.value,
                                })
                              }
                              placeholder="商品名 *"
                              maxLength={200}
                              className="max-w-md h-9 font-medium"
                            />
                            <span
                              className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                lineage === "lib"
                                  ? "bg-gray-50 text-gray-700 border-gray-200"
                                  : "bg-blue-50 text-blue-800 border-blue-200"
                              }`}
                            >
                              {lineage === "lib"
                                ? priceDiffers
                                  ? "📚 同名命中庫 · 已改價"
                                  : "📚 已存品項"
                                : r.opt_out_library
                                ? "＋ 全新 · 一次性"
                                : "＋ 全新 · 將入庫"}
                            </span>
                          </div>
                          <div className="flex gap-2 items-center flex-wrap">
                            <select
                              className="border rounded h-7 px-2 text-xs bg-white"
                              value={r.category_id}
                              onChange={(e) =>
                                patchRow(r.draft_id, {
                                  category_id: e.target.value,
                                  subcategory_id: "",
                                })
                              }
                            >
                              <option value="">類別 *</option>
                              {categories.map((c) => (
                                <option key={c._id} value={c._id}>
                                  {c.name_zh}
                                </option>
                              ))}
                            </select>
                            <select
                              className="border rounded h-7 px-2 text-xs bg-white"
                              value={r.subcategory_id}
                              disabled={!cat}
                              onChange={(e) =>
                                patchRow(r.draft_id, {
                                  subcategory_id: e.target.value,
                                })
                              }
                            >
                              <option value="">
                                {cat ? "子類別 *" : "請先選類別"}
                              </option>
                              {cat?.subcategories.map((s) => (
                                <option key={s._id} value={s._id}>
                                  {s.name_zh}
                                </option>
                              ))}
                            </select>
                            <Input
                              type="url"
                              value={r.product_url}
                              placeholder="URL（選填）"
                              onChange={(e) =>
                                patchRow(r.draft_id, {
                                  product_url: e.target.value,
                                })
                              }
                              className="h-7 text-xs flex-1 min-w-[160px] max-w-xs"
                            />
                          </div>
                          {priceDiffers && (
                            <div className="text-[11px] font-mono text-amber-700">
                              · commit 時將以 {currency}{" "}
                              {r.unit_price.toLocaleString()} 覆蓋庫 default（庫 default ={" "}
                              {currency}{" "}
                              {matched!.default_unit_price.toLocaleString()}
                              ）
                            </div>
                          )}
                          {lineage === "new" && !isBlank(r) && (
                            <label className="text-[11px] text-gray-500 inline-flex gap-1.5 items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!r.opt_out_library}
                                onChange={(e) =>
                                  patchRow(r.draft_id, {
                                    opt_out_library: e.target.checked,
                                  })
                                }
                              />
                              一次性 · 不入庫
                            </label>
                          )}
                        </div>

                        {/* qty */}
                        <div className="text-right">
                          <div className="text-[10px] font-mono uppercase text-gray-500 mb-1">
                            數量
                          </div>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={r.quantity === 1 ? "" : r.quantity || ""}
                            placeholder="1"
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              patchRow(r.draft_id, {
                                quantity: parseInt(e.target.value, 10) || 1,
                              })
                            }
                            className="text-right h-9"
                          />
                        </div>

                        {/* price */}
                        <div className="text-right">
                          <div className="text-[10px] font-mono uppercase text-gray-500 mb-1">
                            單件售價 {currency}
                          </div>
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
                            className={`text-right h-9 ${
                              priceDiffers
                                ? "bg-amber-50 border-amber-300 text-amber-900 font-medium"
                                : ""
                            }`}
                          />
                        </div>

                        {/* subtotal */}
                        <div className="text-right">
                          <div className="text-[10px] font-mono uppercase text-gray-500 mb-1">
                            小計 {currency}
                          </div>
                          <div className="font-semibold text-base h-9 grid place-items-end content-center pr-0">
                            {rowSubtotal.toLocaleString()}
                          </div>
                        </div>

                        {/* actions */}
                        <div className="grid place-items-center pt-5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 h-8 w-8 p-0"
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
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            申報總值
            <b className="text-base ml-2 text-gray-900">
              {currency} {total.toLocaleString()}
            </b>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              {t("inbound_v1.new.item_modal.cancel_btn")}
            </Button>
            <Button
              onClick={() => canSave && onSave(filledRows)}
              disabled={!canSave}
            >
              確認加入申報 →
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
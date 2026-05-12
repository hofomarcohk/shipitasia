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
  // submit handler can bump `used_count` + the ⟲ sync action knows the
  // target saved-item).
  const [linkedToSavedItem, setLinkedToSavedItem] = useState<
    Record<string, string>
  >({});
  // draft_id → true : rows the customer hit ☆ on (already saved into
  // library this session; suppresses the link re-appearing).
  const [savedToLibrary, setSavedToLibrary] = useState<Record<string, boolean>>(
    {}
  );
  const [applied, setApplied] = useState<AppliedFromInbound | null>(null);

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
    setLinkedToSavedItem({});
    setSavedToLibrary({});
    setCustomerRemarks("");
    setError("");
  };

  // ☆ Save a manually-entered row into the library so it can be re-used
  // on later inbounds.
  const saveItemToLibrary = async (it: ItemDraft) => {
    const body = {
      category_id: it.category_id,
      subcategory_id: it.subcategory_id,
      product_name: it.product_name,
      product_url: it.product_url || undefined,
      default_quantity: it.quantity,
      default_unit_price: it.unit_price,
    };
    const r = await http_request("POST", "/api/cms/saved-items", body);
    const d = await r.json();
    if (d.status === 200) {
      setSavedItemPool((prev) => [d.data, ...prev]);
      setLinkedToSavedItem((prev) => ({ ...prev, [it.draft_id]: d.data._id }));
      setSavedToLibrary((prev) => ({ ...prev, [it.draft_id]: true }));
    }
  };

  // ⟲ Push the current row's qty/price back to the library's defaults.
  const syncDefaultsToLibrary = async (it: ItemDraft) => {
    const sid = linkedToSavedItem[it.draft_id];
    if (!sid) return;
    const r = await http_request("PATCH", `/api/cms/saved-items/${sid}`, {
      action: "sync_defaults",
      default_quantity: it.quantity,
      default_unit_price: it.unit_price,
    });
    const d = await r.json();
    if (d.status === 200) {
      setSavedItemPool((prev) =>
        prev.map((p) => (p._id === sid ? d.data : p))
      );
      setSavedToLibrary((prev) => ({ ...prev, [it.draft_id]: true }));
    }
  };

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
    setLinkedToSavedItem({});
    setSavedToLibrary({});
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
        // Fire-and-forget: bump `used_count` on every saved-item that was
        // actually included in this inbound. Doesn't block the redirect.
        const usedIds = Array.from(new Set(Object.values(linkedToSavedItem)));
        if (usedIds.length > 0) {
          http_request("POST", "/api/cms/saved-items/bulk", {
            action: "mark_used",
            ids: usedIds,
          }).catch(() => {});
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
                        const fromLibrary = !!linkedToSavedItem[it.draft_id];
                        const savedNow = !!savedToLibrary[it.draft_id];
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
                              <div className="text-xs text-gray-500 flex items-center gap-1">
                                {fromLibrary ? (
                                  <>📚 已存品項</>
                                ) : savedNow ? (
                                  <span className="text-emerald-600">
                                    {t("saved_items.save_to_library_done")}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="underline hover:text-blue-600"
                                    onClick={() => saveItemToLibrary(it)}
                                  >
                                    {t("saved_items.save_to_library_link")}
                                  </button>
                                )}
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
                              {fromLibrary && !savedNow && (
                                <button
                                  type="button"
                                  className="text-xs text-blue-600 hover:underline mr-2"
                                  onClick={() => syncDefaultsToLibrary(it)}
                                  title={t("saved_items.sync_to_library_btn")}
                                >
                                  ⟲
                                </button>
                              )}
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
                                  setLinkedToSavedItem((prev) => {
                                    const next = { ...prev };
                                    delete next[it.draft_id];
                                    return next;
                                  });
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
        existingLinkedSavedIds={new Set(Object.values(linkedToSavedItem))}
        onSave={(saved, addedLinks) => {
          setItems((prev) => {
            const next = [...prev];
            saved.forEach((s) => {
              const idx = next.findIndex((p) => p.draft_id === s.draft_id);
              if (idx >= 0) next[idx] = s;
              else next.push(s);
            });
            return next;
          });
          if (Object.keys(addedLinks).length > 0) {
            setLinkedToSavedItem((prev) => ({ ...prev, ...addedLinks }));
          }
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
  savedItemPool,
  existingLinkedSavedIds,
  onSave,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  drafts: ItemDraft[];
  categories: Category[];
  currency: string;
  savedItemPool: SavedItem[];
  /** Saved-item IDs already represented in the parent's items list (so
   *  the picker dropdown can disable them). */
  existingLinkedSavedIds: Set<string>;
  onSave: (
    items: ItemDraft[],
    newLinks: Record<string, string>
  ) => void;
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
  // Per-row linkage to a saved-item id, populated when a row is added via
  // the in-modal picker. Returned to the parent on save so used_count can
  // be bumped + ⟲ sync knows the target.
  const [newLinks, setNewLinks] = useState<Record<string, string>>({});
  const [pickerQ, setPickerQ] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Sync incoming drafts → local rows whenever the modal opens. Local
  // edits are isolated until "Save" so cancel cleanly discards them.
  useEffect(() => {
    if (open) {
      setRows(
        drafts.length > 0
          ? drafts.map((d) => ({ ...d }))
          : [blankRow()]
      );
      setNewLinks({});
      setPickerQ("");
      setPickerOpen(false);
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

  // Picker: filter pool by free-text + already-used dedupe.
  const addedFromLibThisModal = new Set(Object.values(newLinks));
  const dimmedSavedIds = new Set([
    ...Array.from(existingLinkedSavedIds),
    ...Array.from(addedFromLibThisModal),
  ]);
  const filteredPool = savedItemPool
    .filter((s) =>
      pickerQ.trim()
        ? s.product_name.toLowerCase().includes(pickerQ.trim().toLowerCase())
        : true
    )
    .slice(0, 8);

  const addFromLibrary = (s: SavedItem) => {
    const draftId = `lib_${s._id}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 5)}`;
    const newRow: ItemDraft = {
      draft_id: draftId,
      category_id: s.category_id,
      subcategory_id: s.subcategory_id,
      product_name: s.product_name,
      product_url: s.product_url ?? "",
      quantity: s.default_quantity,
      unit_price: s.default_unit_price,
    };
    setRows((prev) => {
      // If the only existing row is blank (fresh modal), replace it
      // rather than append — keeps the row count tidy.
      if (prev.length === 1 && isBlank(prev[0])) return [newRow];
      return [...prev, newRow];
    });
    setNewLinks((prev) => ({ ...prev, [draftId]: s._id }));
    setPickerQ("");
    setPickerOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("inbound_v1.new.item_modal.title")}
          </DialogTitle>
        </DialogHeader>

        {/* In-modal picker — search the saved-items library and add a
            prefilled row in one click. */}
        {savedItemPool.length > 0 && (
          <div className="flex items-center gap-2 pb-2 border-b">
            <span className="text-xs text-gray-500 whitespace-nowrap">
              📚 {t("saved_items.picker_title")}
            </span>
            <div className="relative flex-1 max-w-md">
              <Input
                placeholder={t("saved_items.picker_search_placeholder")}
                value={pickerQ}
                onChange={(e) => {
                  setPickerQ(e.target.value);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => {
                  // Delay closing so the row click registers before the
                  // suggestions disappear.
                  setTimeout(() => setPickerOpen(false), 150);
                }}
              />
              {pickerOpen && filteredPool.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow-md z-10 max-h-72 overflow-y-auto">
                  {filteredPool.map((s) => {
                    const dimmed = dimmedSavedIds.has(s._id);
                    const cat = categories.find(
                      (c) => c._id === s.category_id
                    );
                    return (
                      <button
                        key={s._id}
                        type="button"
                        disabled={dimmed}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => !dimmed && addFromLibrary(s)}
                        className="block w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed border-b last:border-b-0"
                      >
                        <div className="font-medium text-sm">
                          {s.product_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {cat?.name_zh ?? s.category_id} · ×
                          {s.default_quantity} · {currency}{" "}
                          {s.default_unit_price.toLocaleString()}
                          {dimmed && (
                            <span className="ml-2 text-emerald-600">
                              · {t("saved_items.picker_already_added")}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

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
                          {newLinks[r.draft_id] && (
                            <span className="text-xs text-emerald-600">
                              📚 由品項庫加入（可即場改）
                            </span>
                          )}
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
            onClick={() => {
              if (!canSave) return;
              // Filter out blanks from newLinks too — only saved rows
              // count toward used_count bumps.
              const keptIds = new Set(filledRows.map((r) => r.draft_id));
              const keptLinks: Record<string, string> = {};
              for (const [k, v] of Object.entries(newLinks)) {
                if (keptIds.has(k)) keptLinks[k] = v;
              }
              onSave(filledRows, keptLinks);
            }}
            disabled={!canSave}
          >
            {t("inbound_v1.new.item_modal.save_btn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

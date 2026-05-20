"use client";

import { useToast } from "@/hooks/use-toast";
import { post_request, get_request } from "@/lib/httpRequest";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  IconBoxSeam,
  IconChevronDown,
  IconInfoCircle,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { SavedItemsPickerSheet } from "./PickerSheets";

type VolumeKey = "small" | "medium" | "large";
type Method = "managed" | "direct" | "manual";

interface ItemRow {
  id: string;
  product_name: string;
  category_id: string;
  subcategory_id: string;
  qty: number;
  price: number;
  saved?: boolean;
}

interface CarrierInbound {
  carrier_inbound_code: string;
  name_zh: string;
  name_en: string;
}

interface CategoryNode {
  _id: string;
  name_zh: string;
  subcategories: { _id: string; name_zh: string }[];
}

interface SavedAddress {
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
}

interface ClientCarrierAccount {
  _id: string;
  carrier_code: string;
  nickname: string;
  status: "active" | "expired" | "revoked";
  is_default: boolean;
}

interface Warehouse {
  warehouseCode: string;
  name_zh: string;
  country_code: string;
}

const VOLUME_OPTIONS: { key: VolumeKey; label: string; desc: string }[] = [
  { key: "small", label: "小", desc: "≤ 1kg / 一個鞋盒" },
  { key: "medium", label: "中", desc: "1-5kg / 標準包裹" },
  { key: "large", label: "大", desc: "≥ 5kg / 多件" },
];

const NEW_ADDRESS_SENTINEL = "__new__";

const LS_LAST_ADDRESS = "oms:last-saved-address-id";
const LS_LAST_CARRIER = "oms:last-carrier-account-id";

const newItemId = () =>
  `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const emptyItem = (): ItemRow => ({
  id: newItemId(),
  product_name: "",
  category_id: "",
  subcategory_id: "",
  qty: 1,
  price: 0,
});

interface NewShipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}

/**
 * Custom-event broadcast so each stage view's hook can refetch immediately
 * after a successful submission/mutation (instead of waiting for poll).
 */
export function broadcastShipmentRefetch() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("shipments:refetch"));
  }
}

export function NewShipmentDialog({
  open,
  onOpenChange,
  onSubmitted,
}: NewShipmentDialogProps) {
  const { toast } = useToast();

  // ── master data (loaded once when dialog opens) ─────────────
  const [carriersInbound, setCarriersInbound] = useState<CarrierInbound[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [carrierAccounts, setCarrierAccounts] = useState<
    ClientCarrierAccount[]
  >([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [masterLoaded, setMasterLoaded] = useState(false);

  useEffect(() => {
    if (!open || masterLoaded) return;
    const fetchAll = async () => {
      try {
        const [r1, r2, r3, r4, r5] = await Promise.all([
          get_request("/api/cms/carriers-inbound"),
          get_request("/api/cms/product-categories"),
          get_request("/api/cms/saved-addresses"),
          get_request("/api/cms/carrier-accounts"),
          get_request("/api/cms/warehouses"),
        ]);
        const [j1, j2, j3, j4, j5] = await Promise.all([
          r1.json(),
          r2.json(),
          r3.json(),
          r4.json(),
          r5.json(),
        ]);
        if (j1.status === 200) setCarriersInbound(j1.data ?? []);
        if (j2.status === 200) setCategoryTree(j2.data ?? []);
        if (j3.status === 200) setSavedAddresses(j3.data ?? []);
        if (j4.status === 200) setCarrierAccounts(j4.data ?? []);
        if (j5.status === 200) {
          const list: Warehouse[] = j5.data ?? [];
          setWarehouses(list);
          // Default to the first warehouse the client has access to.
          if (list.length > 0) setWarehouse(list[0].warehouseCode);
        }

        // Restore last-used recipient + carrier from localStorage, but only
        // when the saved selection still exists in the freshly fetched list.
        if (typeof window !== "undefined") {
          const lastAddrId = localStorage.getItem(LS_LAST_ADDRESS);
          const lastCarrierId = localStorage.getItem(LS_LAST_CARRIER);
          if (j3.status === 200 && lastAddrId) {
            const exists = (j3.data ?? []).some(
              (a: SavedAddress) => a._id === lastAddrId
            );
            if (exists) {
              setSavedAddressId(lastAddrId);
              setAddressMode("saved");
            }
          }
          if (j4.status === 200 && lastCarrierId) {
            const exists = (j4.data ?? []).some(
              (c: ClientCarrierAccount) =>
                c._id === lastCarrierId && c.status === "active"
            );
            if (exists) setCarrierAccountId(lastCarrierId);
          }
        }

        setMasterLoaded(true);
      } catch (e) {
        toast({
          title: "資料載入失敗",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      }
    };
    void fetchAll();
  }, [open, masterLoaded, toast]);

  // ── form state ──────────────────────────────────────────────
  const [warehouse, setWarehouse] = useState("");
  const [inboundCarrierCode, setInboundCarrierCode] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [volume, setVolume] = useState<VolumeKey>("medium");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hasLiquid, setHasLiquid] = useState(false);
  const [hasBattery, setHasBattery] = useState(false);

  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);

  const [method, setMethod] = useState<Method>("managed");
  const [manualOpen, setManualOpen] = useState(false);

  const [addressMode, setAddressMode] = useState<"saved" | "new">("saved");
  const [savedAddressId, setSavedAddressId] = useState<string>("");
  const [newAddress, setNewAddress] = useState({
    label: "",
    name: "",
    phone: "",
    country_code: "HK",
    city: "",
    district: "",
    address: "",
    postal_code: "",
  });
  const [carrierAccountId, setCarrierAccountId] = useState<string>("");

  const [remarks, setRemarks] = useState("");

  // Picker sheet for bulk insert from library (orthogonal to per-row save)
  const [savedItemsOpen, setSavedItemsOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Live consolidate detection — calls /api/cms/consolidation-groups/check
  // whenever the (warehouse, saved_address_id, carrier_account_id) tuple is
  // complete in managed mode. Mirrors backend's findOrCreateConsolidationGroup
  // logic so the customer sees the same outcome before submit.
  interface PendingGroupSummary {
    group_id: string;
    sweep_due_ymd: string | null;
    oldest_received_at_ymd: string | null;
    forecast_count: number;
    received_forecast_count: number;
  }
  const [pendingGroup, setPendingGroup] = useState<PendingGroupSummary | null>(
    null
  );
  const [startNewGroup, setStartNewGroup] = useState(false);

  const resetForm = () => {
    setInboundCarrierCode("");
    setTrackingNo("");
    setVolume("medium");
    setAdvancedOpen(false);
    setHasLiquid(false);
    setHasBattery(false);
    setItems([emptyItem()]);
    setMethod("managed");
    setManualOpen(false);
    setAddressMode("saved");
    setSavedAddressId("");
    setNewAddress({
      label: "",
      name: "",
      phone: "",
      country_code: "HK",
      city: "",
      district: "",
      address: "",
      postal_code: "",
    });
    setCarrierAccountId("");
    setRemarks("");
  };

  // ── derived ─────────────────────────────────────────────────
  const itemSummary = useMemo(() => {
    const filled = items.filter((it) => it.product_name.trim());
    return {
      count: filled.length,
      totalQty: filled.reduce((s, it) => s + (it.qty || 0), 0),
      totalValue: filled.reduce(
        (s, it) => s + (it.qty || 0) * (it.price || 0),
        0
      ),
    };
  }, [items]);

  const selectedAddress = useMemo(
    () => savedAddresses.find((a) => a._id === savedAddressId),
    [savedAddresses, savedAddressId]
  );

  const recipientLabel = useMemo(() => {
    if (addressMode === "new") return newAddress.name || "（新地址）";
    if (selectedAddress) {
      return `${selectedAddress.name} · ${selectedAddress.city}`;
    }
    return "—";
  }, [addressMode, newAddress.name, selectedAddress]);

  const selectedCarrier = useMemo(
    () => carrierAccounts.find((c) => c._id === carrierAccountId),
    [carrierAccounts, carrierAccountId]
  );

  const carrierLabel = selectedCarrier
    ? `${selectedCarrier.nickname} · ${selectedCarrier.carrier_code}`
    : "—";

  // Whenever the managed-mode tuple is complete, hit the check endpoint and
  // surface the matching pending group (if any). For new-address mode we
  // skip — a brand-new saved_address can't possibly match an existing group
  // by definition.
  useEffect(() => {
    if (
      method !== "managed" ||
      addressMode !== "saved" ||
      !warehouse ||
      !savedAddressId ||
      !carrierAccountId
    ) {
      setPendingGroup(null);
      setStartNewGroup(false);
      return;
    }
    let cancelled = false;
    const fetcher = async () => {
      try {
        const r = await get_request(
          "/api/cms/consolidation-groups/check",
          {
            warehouseCode: warehouse,
            saved_address_id: savedAddressId,
            carrier_account_id: carrierAccountId,
          }
        );
        const j = await r.json();
        if (cancelled) return;
        if (j.status === 200) {
          setPendingGroup(j.data?.group ?? null);
        } else {
          setPendingGroup(null);
        }
      } catch {
        if (!cancelled) setPendingGroup(null);
      }
    };
    // Tiny debounce so rapid select changes coalesce
    const t = setTimeout(fetcher, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [method, addressMode, warehouse, savedAddressId, carrierAccountId]);

  const consolidateDetected =
    method === "managed" && addressMode === "saved" && pendingGroup !== null;

  // ── item row mutators ───────────────────────────────────────
  const updateItem = (id: string, patch: Partial<ItemRow>) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, ...patch, saved: false } : it
      )
    );
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (id: string) =>
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((it) => it.id !== id)
    );

  const handleSubmit = async () => {
    const fullyValid = (it: ItemRow) =>
      !!it.product_name.trim() &&
      !!it.category_id &&
      !!it.subcategory_id &&
      it.qty > 0;

    // MEDIUM-006 fix — surface partial rows instead of silently dropping
    // them. A row counts as "looks used" if the customer typed a name or set
    // a price (default qty=1 doesn't count as user input).
    const looksUsed = (it: ItemRow) =>
      !!it.product_name.trim() || it.price > 0;
    const partialRows = items.filter(
      (it) => looksUsed(it) && !fullyValid(it)
    );
    if (partialRows.length > 0) {
      toast({
        title: `有 ${partialRows.length} 項申報品項未填齊`,
        description: "每行需要：名稱、主類、子類、數量 > 0。請補齊或刪除呢啲行先提交。",
        variant: "destructive",
      });
      return;
    }

    const validItems = items.filter(fullyValid);
    if (validItems.length === 0) {
      toast({
        title: "請至少填好 1 項申報品項",
        description: "需要：品項名稱、主類、子類、數量 > 0",
        variant: "destructive",
      });
      return;
    }
    if (!warehouse || !inboundCarrierCode || !trackingNo.trim()) {
      toast({
        title: "包裹資訊未填齊",
        description: "倉庫、入庫快遞同貨物追蹤號都必填",
        variant: "destructive",
      });
      return;
    }

    const shipping_mode =
      method === "managed"
        ? "managed_consign"
        : method === "direct"
        ? "single_direct"
        : "manual_consolidate";

    let effectiveAddressId: string | null = null;
    let receiver_snapshot: Record<string, unknown> | null = null;

    if (shipping_mode !== "manual_consolidate") {
      if (!carrierAccountId) {
        toast({ title: "請揀 Carrier 帳號", variant: "destructive" });
        return;
      }
      if (addressMode === "saved" && !savedAddressId) {
        toast({ title: "請揀收件人", variant: "destructive" });
        return;
      }
      if (addressMode === "new") {
        const missing = [
          !newAddress.label && "標籤",
          !newAddress.name && "姓名",
          !newAddress.phone && "電話",
          !newAddress.city && "城市",
          !newAddress.address && "詳細地址",
        ].filter(Boolean);
        if (missing.length > 0) {
          toast({
            title: "新地址欄位未填齊",
            description: `缺：${missing.join("、")}`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      // 1. If new-address mode, save it first so we get a saved_address_id
      if (
        shipping_mode !== "manual_consolidate" &&
        addressMode === "new"
      ) {
        const addrPayload: Record<string, unknown> = {
          label: newAddress.label,
          name: newAddress.name,
          phone: newAddress.phone,
          country_code: newAddress.country_code,
          city: newAddress.city,
          address: newAddress.address,
        };
        if (newAddress.district)
          addrPayload.district = newAddress.district;
        if (newAddress.postal_code)
          addrPayload.postal_code = newAddress.postal_code;
        const ar = await post_request(
          "/api/cms/saved-addresses",
          addrPayload
        );
        const aj = await ar.json();
        if (aj.status !== 200) {
          toast({
            title: "新增地址失敗",
            description: aj.message ?? `HTTP ${aj.status}`,
            variant: "destructive",
          });
          setSubmitting(false);
          return;
        }
        effectiveAddressId = aj.data._id;
        receiver_snapshot = {
          name: newAddress.name,
          phone: newAddress.phone,
          country_code: newAddress.country_code,
          city: newAddress.city,
          address: newAddress.address,
          ...(newAddress.district ? { district: newAddress.district } : {}),
          ...(newAddress.postal_code
            ? { postal_code: newAddress.postal_code }
            : {}),
        };
      } else if (shipping_mode !== "manual_consolidate" && selectedAddress) {
        effectiveAddressId = selectedAddress._id;
        receiver_snapshot = {
          name: selectedAddress.name,
          phone: selectedAddress.phone,
          country_code: selectedAddress.country_code,
          city: selectedAddress.city,
          address: selectedAddress.address,
          ...(selectedAddress.district
            ? { district: selectedAddress.district }
            : {}),
          ...(selectedAddress.postal_code
            ? { postal_code: selectedAddress.postal_code }
            : {}),
        };
      }

      // 2. Build CreateInboundInput payload
      const payload: Record<string, unknown> = {
        warehouseCode: warehouse,
        carrier_inbound_code: inboundCarrierCode,
        tracking_no: trackingNo.trim(),
        inbound_source: "regular",
        size_estimate: volume,
        contains_liquid: hasLiquid,
        contains_battery: hasBattery,
        shipping_mode,
        declared_items: validItems.map((it) => ({
          category_id: it.category_id,
          subcategory_id: it.subcategory_id,
          product_name: it.product_name.trim(),
          quantity: it.qty,
          unit_price: it.price,
        })),
      };
      if (remarks.trim()) payload.customer_remarks = remarks.trim();
      if (shipping_mode !== "manual_consolidate") {
        payload.shipping_destination = {
          saved_address_id: effectiveAddressId,
          receiver_address_snapshot: receiver_snapshot,
          carrier_account_id: carrierAccountId,
        };
      }
      // If managed + customer ticked「另開新組」, forward the start-new flag so
      // the backend skips findExisting + creates a fresh consolidation_group.
      if (shipping_mode === "managed_consign" && startNewGroup) {
        payload.start_new_consolidation_group = true;
      }

      // 3. POST /api/cms/inbound
      const r = await post_request("/api/cms/inbound", payload);
      const j = await r.json();
      if (j.status !== 200) {
        toast({
          title: "提交失敗",
          description: j.message ?? `HTTP ${j.status}`,
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      toast({
        title: "預報已提交",
        description: `${j.data?._id ?? ""} 已落入「等待入庫」`,
      });

      // Persist the last-used recipient + carrier so the next submit can
      // restore them automatically. For new-address mode we use the newly
      // created saved_address_id from the earlier POST.
      if (typeof window !== "undefined" && effectiveAddressId) {
        localStorage.setItem(LS_LAST_ADDRESS, effectiveAddressId);
      }
      if (typeof window !== "undefined" && carrierAccountId) {
        localStorage.setItem(LS_LAST_CARRIER, carrierAccountId);
      }

      resetForm();
      broadcastShipmentRefetch();
      // HIGH-002 fix — both onOpenChange (handleCloseNew) and onSubmitted call
      // router.replace using the SAME stale searchParams baseline (?stage=X&new=1).
      // Last call wins, so onSubmitted MUST be invoked AFTER onOpenChange so
      // its `?stage=waiting_inbound` write isn't clobbered by the close-handler's
      // baseline restore.
      onOpenChange(false);
      onSubmitted?.();
    } catch (e) {
      toast({
        title: "提交失敗",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const saveItemToLibrary = async (it: ItemRow) => {
    try {
      const r = await post_request("/api/cms/saved-items", {
        category_id: it.category_id,
        subcategory_id: it.subcategory_id,
        product_name: it.product_name.trim(),
        default_quantity: it.qty,
        default_unit_price: it.price,
      });
      const json = await r.json();
      if (json.status === 200) {
        toast({ title: "已存入品項庫" });
        setItems((prev) =>
          prev.map((row) =>
            row.id === it.id ? { ...row, saved: true } : row
          )
        );
      } else {
        toast({
          title: "存入失敗",
          description: json.message ?? `HTTP ${json.status}`,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "存入失敗",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  // ── render helpers ─────────────────────────────────────────
  const inboundCarrierName =
    carriersInbound.find((c) => c.carrier_inbound_code === inboundCarrierCode)
      ?.name_zh ?? "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px] w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-[18px]">新增預報</DialogTitle>
              <DialogDescription className="text-[12.5px] mt-0.5">
                Happy path：託管 + 已儲存收件人 + 已儲存品項 = 3 步
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm">
              儲存草稿
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-muted/30 p-6 scrollbar">
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {/* Section 1 — 包裹資訊 */}
              <SectionCard num="1" title="包裹資訊">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="收貨倉庫">
                    <Select value={warehouse || undefined} onValueChange={setWarehouse}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="揀收貨倉庫…" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            （載入中…）
                          </SelectItem>
                        ) : (
                          warehouses.map((w) => (
                            <SelectItem key={w.warehouseCode} value={w.warehouseCode}>
                              {w.name_zh} ({w.warehouseCode})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="入庫快遞">
                    <Select
                      value={inboundCarrierCode}
                      onValueChange={setInboundCarrierCode}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="揀入庫快遞…" />
                      </SelectTrigger>
                      <SelectContent>
                        {carriersInbound.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            （載入中…）
                          </SelectItem>
                        ) : (
                          carriersInbound.map((c) => (
                            <SelectItem
                              key={c.carrier_inbound_code}
                              value={c.carrier_inbound_code}
                            >
                              {c.name_zh}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="貨物追蹤號" className="sm:col-span-2">
                    <Input
                      value={trackingNo}
                      onChange={(e) => setTrackingNo(e.target.value)}
                      placeholder="例：1234-5678-9012"
                      className="h-9 font-mono"
                    />
                  </Field>
                </div>

                <Field label="體積估算" className="mt-4">
                  <div className="grid grid-cols-3 gap-2">
                    {VOLUME_OPTIONS.map((opt) => {
                      const active = opt.key === volume;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setVolume(opt.key)}
                          className={cn(
                            "rounded-md border px-3 py-2.5 text-left transition-colors",
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background hover:border-foreground/40"
                          )}
                        >
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div
                            className={cn(
                              "mt-0.5 text-[11px]",
                              active
                                ? "text-background/80"
                                : "text-muted-foreground"
                            )}
                          >
                            {opt.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger className="mt-4 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                    <IconChevronDown
                      size={13}
                      className={cn(
                        "transition-transform",
                        advancedOpen && "rotate-180"
                      )}
                    />
                    進階屬性（申報類型・含液體・含電池）— 一般情況唔需要展開
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 grid gap-3 sm:grid-cols-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
                    <Field label="申報類型">
                      <Select defaultValue="general">
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">一般貨物</SelectItem>
                          <SelectItem value="gift">禮物</SelectItem>
                          <SelectItem value="sample">樣品</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                      <Checkbox
                        checked={hasLiquid}
                        onCheckedChange={(c) => setHasLiquid(c === true)}
                      />
                      含液體
                    </label>
                    <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                      <Checkbox
                        checked={hasBattery}
                        onCheckedChange={(c) => setHasBattery(c === true)}
                      />
                      含電池
                    </label>
                  </CollapsibleContent>
                </Collapsible>
              </SectionCard>

              {/* Section 2 — 申報品項 */}
              <SectionCard
                num="2"
                title="申報品項"
                right={
                  <span className="text-[11.5px] text-muted-foreground">
                    合計 JPY {itemSummary.totalValue.toLocaleString()} ·{" "}
                    {itemSummary.totalQty} 件
                  </span>
                }
              >
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="grid grid-cols-[1.3fr_0.9fr_0.9fr_60px_85px_28px_28px] gap-2 bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                    <div>品項名稱</div>
                    <div>主類</div>
                    <div>子類</div>
                    <div className="text-right">數量</div>
                    <div className="text-right">單價 (JPY)</div>
                    <div />
                    <div />
                  </div>
                  {items.map((it) => {
                    const subcats =
                      categoryTree.find((c) => c._id === it.category_id)
                        ?.subcategories ?? [];
                    const canSave =
                      !!it.product_name.trim() &&
                      !!it.category_id &&
                      !!it.subcategory_id &&
                      it.qty > 0 &&
                      it.price > 0;
                    return (
                      <div
                        key={it.id}
                        className="grid grid-cols-[1.3fr_0.9fr_0.9fr_60px_85px_28px_28px] gap-2 border-t border-border px-3 py-2 items-center"
                      >
                        <Input
                          value={it.product_name}
                          onChange={(e) =>
                            updateItem(it.id, { product_name: e.target.value })
                          }
                          placeholder="例：無線耳機"
                          className="h-7 text-xs"
                        />
                        <Select
                          value={it.category_id || undefined}
                          onValueChange={(v) =>
                            updateItem(it.id, {
                              category_id: v,
                              subcategory_id: "",
                            })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="主類…" />
                          </SelectTrigger>
                          <SelectContent>
                            {categoryTree.map((c) => (
                              <SelectItem key={c._id} value={c._id}>
                                {c.name_zh}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={it.subcategory_id || undefined}
                          onValueChange={(v) =>
                            updateItem(it.id, { subcategory_id: v })
                          }
                          disabled={!it.category_id}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue
                              placeholder={
                                it.category_id ? "子類…" : "先揀主類"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {subcats.map((s) => (
                              <SelectItem key={s._id} value={s._id}>
                                {s.name_zh}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          value={it.qty}
                          onChange={(e) =>
                            updateItem(it.id, {
                              qty: Number(e.target.value) || 0,
                            })
                          }
                          className="h-7 text-xs text-right font-mono"
                        />
                        <Input
                          type="number"
                          min={0}
                          value={it.price}
                          onChange={(e) =>
                            updateItem(it.id, {
                              price: Number(e.target.value) || 0,
                            })
                          }
                          className="h-7 text-xs text-right font-mono"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7",
                            it.saved
                              ? "text-[hsl(var(--brand-strong))]"
                              : "text-muted-foreground hover:text-[hsl(var(--brand-strong))]"
                          )}
                          onClick={() => saveItemToLibrary(it)}
                          disabled={!canSave || it.saved}
                          title={
                            it.saved
                              ? "已存入品項庫"
                              : canSave
                              ? "存入品項庫"
                              : "填齊品項資料先可存入"
                          }
                          aria-label="存入品項庫"
                        >
                          {it.saved ? (
                            <IconStarFilled size={13} />
                          ) : (
                            <IconStar size={13} />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(it.id)}
                          disabled={items.length === 1}
                          aria-label="刪除品項"
                        >
                          <IconTrash size={13} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addItem}
                  >
                    <IconPlus size={13} className="mr-1" />
                    新增品項
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSavedItemsOpen(true)}
                  >
                    <IconBoxSeam size={13} className="mr-1" />
                    從已儲存品項揀
                  </Button>
                </div>
              </SectionCard>

              {/* Section 3 — 寄送方式 */}
              <SectionCard num="3" title="寄送方式">
                <RadioGroup
                  value={method}
                  onValueChange={(v) => setMethod(v as Method)}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <RadioCard
                    id="m-managed"
                    value="managed"
                    selected={method === "managed"}
                    title="託管寄送"
                    desc="3 工作天內倉庫自動合單；同 client + 同地址 + 同 carrier 嘅貨件自動併箱。"
                    recommended
                  />
                  <RadioCard
                    id="m-direct"
                    value="direct"
                    selected={method === "direct"}
                    title="單一直送"
                    desc="到貨即時 1:1 出庫；唔等其他包裹。"
                  />
                </RadioGroup>

                <Collapsible
                  open={manualOpen}
                  onOpenChange={setManualOpen}
                  className="mt-3"
                >
                  <CollapsibleTrigger
                    className={cn(
                      "inline-flex items-center gap-1 text-[12px]",
                      method === "manual"
                        ? "text-destructive"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <IconChevronDown
                      size={13}
                      className={cn(
                        "transition-transform",
                        manualOpen && "rotate-180"
                      )}
                    />
                    我要手動併貨（fallback，唔推薦）
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <RadioGroupItem
                        value="manual"
                        id="m-manual"
                        checked={method === "manual"}
                        onClick={() => setMethod("manual")}
                      />
                      <span>
                        <span className="font-medium text-foreground">
                          手動指定併貨群組
                        </span>
                        <span className="block mt-0.5">
                          手動揀邊幾件併埋一齊。需要自己管理時序，唔保證最低 cost 路徑。
                        </span>
                      </span>
                    </label>
                  </CollapsibleContent>
                </Collapsible>
              </SectionCard>

              {/* Section 4 — 收件人 & Carrier */}
              <SectionCard
                num="4"
                title="收件人 & Carrier"
                right={
                  method === "managed" ? (
                    <span className="text-[11.5px] text-muted-foreground">
                      託管模式必須揀已儲存地址或新建後儲存
                    </span>
                  ) : null
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="收件人">
                    <Select
                      value={
                        addressMode === "new"
                          ? NEW_ADDRESS_SENTINEL
                          : savedAddressId || undefined
                      }
                      onValueChange={(v) => {
                        if (v === NEW_ADDRESS_SENTINEL) {
                          setAddressMode("new");
                          setSavedAddressId("");
                        } else {
                          setAddressMode("saved");
                          setSavedAddressId(v);
                        }
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="揀已儲存地址或新建…" />
                      </SelectTrigger>
                      <SelectContent>
                        {savedAddresses.map((a) => (
                          <SelectItem key={a._id} value={a._id}>
                            {a.label} · {a.name} / {a.city}
                            {a.is_default && " （預設）"}
                          </SelectItem>
                        ))}
                        {savedAddresses.length > 0 && (
                          <div className="my-1 h-px bg-border" />
                        )}
                        <SelectItem value={NEW_ADDRESS_SENTINEL}>
                          + 新建地址
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Carrier 帳號">
                    <Select
                      value={carrierAccountId || undefined}
                      onValueChange={setCarrierAccountId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="揀已連結 Carrier 帳號…" />
                      </SelectTrigger>
                      <SelectContent>
                        {carrierAccounts.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            （未連結 Carrier 帳號）
                          </SelectItem>
                        ) : (
                          carrierAccounts.map((c) => (
                            <SelectItem
                              key={c._id}
                              value={c._id}
                              disabled={c.status !== "active"}
                            >
                              {c.nickname} · {c.carrier_code}
                              {c.is_default && " （預設）"}
                              {c.status !== "active" && " （未啟用）"}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {/* New-address inline form */}
                {addressMode === "new" && (
                  <div className="mt-3 rounded-md border border-dashed border-border bg-[hsl(var(--brand-soft))]/50 p-4">
                    <div className="mb-2 text-[11.5px] font-medium text-[hsl(var(--brand-strong))]">
                      新建地址（提交後會自動存入常用地址）
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="標籤 (label)">
                        <Input
                          value={newAddress.label}
                          onChange={(e) =>
                            setNewAddress((p) => ({
                              ...p,
                              label: e.target.value,
                            }))
                          }
                          placeholder="例：香港家"
                          className="h-9"
                        />
                      </Field>
                      <Field label="收件人姓名">
                        <Input
                          value={newAddress.name}
                          onChange={(e) =>
                            setNewAddress((p) => ({
                              ...p,
                              name: e.target.value,
                            }))
                          }
                          className="h-9"
                        />
                      </Field>
                      <Field label="電話">
                        <Input
                          value={newAddress.phone}
                          onChange={(e) =>
                            setNewAddress((p) => ({
                              ...p,
                              phone: e.target.value,
                            }))
                          }
                          placeholder="+852-xxxx-xxxx"
                          className="h-9 font-mono"
                        />
                      </Field>
                      <Field label="國家 / 地區">
                        <Select
                          value={newAddress.country_code}
                          onValueChange={(v) =>
                            setNewAddress((p) => ({ ...p, country_code: v }))
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="HK">香港</SelectItem>
                            <SelectItem value="TW">台灣</SelectItem>
                            <SelectItem value="JP">日本</SelectItem>
                            <SelectItem value="SG">新加坡</SelectItem>
                            <SelectItem value="MY">馬來西亞</SelectItem>
                            <SelectItem value="US">美國</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="城市">
                        <Input
                          value={newAddress.city}
                          onChange={(e) =>
                            setNewAddress((p) => ({
                              ...p,
                              city: e.target.value,
                            }))
                          }
                          className="h-9"
                        />
                      </Field>
                      <Field label="行政區（選填）">
                        <Input
                          value={newAddress.district}
                          onChange={(e) =>
                            setNewAddress((p) => ({
                              ...p,
                              district: e.target.value,
                            }))
                          }
                          className="h-9"
                        />
                      </Field>
                      <Field label="詳細地址" className="sm:col-span-2">
                        <Input
                          value={newAddress.address}
                          onChange={(e) =>
                            setNewAddress((p) => ({
                              ...p,
                              address: e.target.value,
                            }))
                          }
                          className="h-9"
                        />
                      </Field>
                      <Field label="郵遞區號（選填）">
                        <Input
                          value={newAddress.postal_code}
                          onChange={(e) =>
                            setNewAddress((p) => ({
                              ...p,
                              postal_code: e.target.value,
                            }))
                          }
                          className="h-9 font-mono"
                        />
                      </Field>
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* Section 5 — 備註 */}
              <SectionCard
                num="5"
                title="備註"
                right={
                  <span className="text-[11.5px] text-muted-foreground">
                    選填
                  </span>
                }
              >
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="特別要求 / 注意事項…"
                  rows={3}
                  className="resize-none text-sm"
                />
              </SectionCard>
            </div>

            {/* Right summary */}
            <div>
              <Card className="sticky top-0">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    預報摘要
                  </h3>

                  {consolidateDetected && pendingGroup && (
                    <Alert className="border-[hsl(var(--brand))] bg-[hsl(var(--brand-soft))] text-foreground">
                      <IconInfoCircle
                        size={15}
                        className="text-[hsl(var(--brand-strong))]"
                      />
                      <AlertTitle className="text-[12.5px] font-medium">
                        已偵測同組待併{" "}
                        <span className="font-mono">
                          {pendingGroup.forecast_count}
                        </span>{" "}
                        件
                      </AlertTitle>
                      <AlertDescription className="space-y-2 text-[11.5px] text-muted-foreground">
                        <div>
                          組{" "}
                          <span className="font-mono text-foreground">
                            {pendingGroup.group_id}
                          </span>{" "}
                          已有{" "}
                          <span className="text-foreground font-medium">
                            {pendingGroup.received_forecast_count}/
                            {pendingGroup.forecast_count}
                          </span>{" "}
                          件上架
                          {pendingGroup.sweep_due_ymd && (
                            <>
                              {" "}· 預計{" "}
                              <span className="text-foreground font-medium">
                                {pendingGroup.sweep_due_ymd}
                              </span>{" "}
                              自動出貨
                            </>
                          )}
                          。
                        </div>
                        <RadioGroup
                          value={startNewGroup ? "new" : "join"}
                          onValueChange={(v) =>
                            setStartNewGroup(v === "new")
                          }
                          className="space-y-1.5 pt-1"
                        >
                          <Label
                            htmlFor="cg-join"
                            className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background p-2 text-[12px] data-[state=on]:border-foreground"
                          >
                            <RadioGroupItem
                              value="join"
                              id="cg-join"
                              className="mt-0.5"
                            />
                            <span>
                              <span className="font-medium text-foreground">
                                加入現有組（推薦）
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                同收件人 + Carrier 一齊出貨，慳運費
                              </span>
                            </span>
                          </Label>
                          <Label
                            htmlFor="cg-new"
                            className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background p-2 text-[12px]"
                          >
                            <RadioGroupItem
                              value="new"
                              id="cg-new"
                              className="mt-0.5"
                            />
                            <span>
                              <span className="font-medium text-foreground">
                                另開新組
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                獨立排 3 工作天 SLA，唔影響現有組
                              </span>
                            </span>
                          </Label>
                        </RadioGroup>
                      </AlertDescription>
                    </Alert>
                  )}

                  <SummaryRow
                    label="收貨倉庫"
                    value={
                      warehouses.find((w) => w.warehouseCode === warehouse)
                        ?.name_zh ?? warehouseLabel(warehouse)
                    }
                  />
                  <SummaryRow label="入庫快遞" value={inboundCarrierName} />
                  <SummaryRow
                    label="追蹤號"
                    value={trackingNo || "—"}
                    mono
                  />
                  <SummaryRow
                    label="體積"
                    value={
                      VOLUME_OPTIONS.find((v) => v.key === volume)?.label ?? "—"
                    }
                  />
                  <SummaryRow
                    label="品項"
                    value={
                      itemSummary.count
                        ? `${itemSummary.count} 項 / ${itemSummary.totalQty} 件`
                        : "—"
                    }
                  />
                  <SummaryRow
                    label="申報值"
                    value={
                      itemSummary.totalValue
                        ? `JPY ${itemSummary.totalValue.toLocaleString()}`
                        : "—"
                    }
                    mono
                  />
                  <SummaryRow label="寄送方式" value={methodLabel(method)} />
                  <SummaryRow label="收件人" value={recipientLabel} />
                  <SummaryRow label="Carrier" value={carrierLabel} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t bg-background px-6 py-3">
          <p className="text-[11.5px] text-muted-foreground max-w-[55%]">
            提交後倉庫將代為集箱及代取運單；運費由所選 Carrier 帳號扣除。
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "提交中…" : "提交預報 →"}
            </Button>
          </div>
        </footer>

        {/* Multi-select pick from library */}
        <SavedItemsPickerSheet
          open={savedItemsOpen}
          onOpenChange={setSavedItemsOpen}
          onPick={(picked) => {
            setItems((prev) => {
              const filledExisting = prev.filter((it) =>
                it.product_name.trim()
              );
              const adds: ItemRow[] = picked.map((p) => ({
                id: newItemId(),
                product_name: p.name,
                category_id: p.category_id,
                subcategory_id: p.subcategory_id,
                qty: p.qty,
                price: p.price,
                saved: true,
              }));
              const merged = [...filledExisting, ...adds];
              return merged.length > 0 ? merged : [emptyItem()];
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * Sub-components
 * ==========================================================*/

function SectionCard({
  num,
  title,
  right,
  children,
}: {
  num: string;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[13.5px] font-semibold">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10.5px] font-semibold text-muted-foreground">
              {num}
            </span>
            {title}
          </h3>
          {right}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11.5px] font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function RadioCard({
  id,
  value,
  selected,
  title,
  desc,
  recommended,
}: {
  id: string;
  value: string;
  selected: boolean;
  title: string;
  desc: string;
  recommended?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "relative flex cursor-pointer flex-col rounded-md border p-3 transition-colors",
        selected
          ? "border-foreground bg-muted/40"
          : "border-border hover:border-foreground/40"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RadioGroupItem value={value} id={id} />
          <span className="text-[13.5px] font-medium">{title}</span>
        </div>
        {recommended && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-[hsl(var(--brand-soft))] px-2 py-0.5 text-[10.5px] font-medium text-[hsl(var(--brand-strong))]">
            <IconStar size={10} />
            推薦
          </span>
        )}
      </div>
      <span className="mt-2 pl-6 text-[11.5px] leading-snug text-muted-foreground">
        {desc}
      </span>
    </label>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right max-w-[180px] truncate",
          mono && "font-mono tabular-nums"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// kept as a no-op fallback; actual label resolved inline from warehouses[].
function warehouseLabel(key: string): string {
  return key || "—";
}

function methodLabel(m: Method): string {
  switch (m) {
    case "managed":
      return "託管寄送";
    case "direct":
      return "單一直送";
    case "manual":
      return "手動併貨";
  }
}

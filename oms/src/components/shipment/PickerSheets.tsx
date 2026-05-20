"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { get_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import {
  IconMapPin,
  IconPackage,
  IconSearch,
  IconTruck,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

/* ============================================================
 * Saved items — fetched from /api/cms/saved-items (real backend)
 * ==========================================================*/

export interface SavedItemRow {
  id: string;
  name: string;
  /** Backend category_id; opaque opaque to picker UI but used by caller. */
  category_id: string;
  subcategory_id: string;
  /** Display label resolved from category tree (optional). */
  categoryLabel?: string;
  qty: number;
  price: number;
  usedCount: number;
}

export interface SavedAddressRow {
  id: string;
  name: string;
  recipientName: string;
  region: string;
  detail: string;
  phone: string;
  default?: boolean;
}

const MOCK_SAVED_ADDRESSES: SavedAddressRow[] = [
  {
    id: "addr_001",
    name: "陳大文 - 台北家",
    recipientName: "陳大文",
    region: "台北市信義區",
    detail: "市府路 1 號 12F-3",
    phone: "+886 9xx-xxx-xxx",
    default: true,
  },
  {
    id: "addr_002",
    name: "李小薇 - 香港九龍灣",
    recipientName: "李小薇",
    region: "香港九龍灣",
    detail: "宏照道 11 號 8 樓 B 室",
    phone: "+852 6xxx-xxxx",
  },
  {
    id: "addr_003",
    name: "王俊明 - 台中辦公室",
    recipientName: "王俊明",
    region: "台中市西屯區",
    detail: "市政路 386 號 23F",
    phone: "+886 9xx-xxx-xxx",
  },
];

export interface CarrierAccountRow {
  id: string;
  name: string;
  accountNo: string;
  region: string;
  active: boolean;
}

const MOCK_CARRIER_ACCOUNTS: CarrierAccountRow[] = [
  { id: "carr_001", name: "SF Express", accountNo: "acc_021", region: "HK / TW / CN", active: true },
  { id: "carr_002", name: "黑貓宅急便", accountNo: "acc_007", region: "JP / TW", active: true },
  { id: "carr_003", name: "DHL Express", accountNo: "acc_014", region: "Global", active: true },
  { id: "carr_004", name: "日本郵便 EMS", accountNo: "acc_032", region: "Global", active: false },
];

/* ============================================================
 * Saved items multi-select picker
 * ==========================================================*/

interface SavedItemsPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (items: SavedItemRow[]) => void;
}

export function SavedItemsPickerSheet({
  open,
  onOpenChange,
  onPick,
}: SavedItemsPickerSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<SavedItemRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fetcher = async () => {
      setIsLoading(true);
      try {
        const r = await get_request("/api/cms/saved-items");
        const j = await r.json();
        if (j.status === 200) {
          const list = (j.data ?? []) as Array<{
            _id: string;
            category_id: string;
            subcategory_id: string;
            product_name: string;
            default_quantity: number;
            default_unit_price: number;
            used_count: number;
          }>;
          setItems(
            list.map((d) => ({
              id: d._id,
              name: d.product_name,
              category_id: d.category_id,
              subcategory_id: d.subcategory_id,
              categoryLabel: `${d.category_id} · ${d.subcategory_id}`,
              qty: d.default_quantity ?? 1,
              price: d.default_unit_price ?? 0,
              usedCount: d.used_count ?? 0,
            }))
          );
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };
    void fetcher();
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.categoryLabel ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const handleConfirm = () => {
    const picked = items.filter((r) => selected.has(r.id));
    onPick(picked);
    setSelected(new Set());
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <IconPackage size={16} />
            從已儲存品項揀
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            可多選；確認後一次過插入「申報品項」list。
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-3 border-b">
          <div className="relative">
            <IconSearch
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋品項 / 分類…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar">
          {isLoading && items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              載入中…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "未有任何已儲存品項。喺新增預報時揀 ☆ 即可存入。"
                : "無符合搜尋嘅品項"}
            </div>
          ) : (
            filtered.map((r) => {
              const isSel = selected.has(r.id);
              return (
                <label
                  key={r.id}
                  htmlFor={`si-${r.id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b border-border px-6 py-3 transition-colors",
                    isSel ? "bg-muted/40" : "hover:bg-muted/20"
                  )}
                >
                  <Checkbox
                    id={`si-${r.id}`}
                    checked={isSel}
                    onCheckedChange={() => toggle(r.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{r.name}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {r.categoryLabel ?? "—"} · 用過 {r.usedCount} 次
                    </div>
                  </div>
                  <div className="font-mono text-[12px] text-muted-foreground tabular-nums">
                    JPY {r.price.toLocaleString()}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <SheetFooter className="border-t bg-background px-6 py-3 flex flex-row items-center justify-between gap-2 sm:justify-between">
          <span className="text-[12px] text-muted-foreground">
            已選 {selected.size} 項
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0}
              onClick={handleConfirm}
            >
              加入 {selected.size} 項
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ============================================================
 * Saved addresses single-select picker
 * ==========================================================*/

interface SavedAddressesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (address: SavedAddressRow) => void;
}

export function SavedAddressesSheet({
  open,
  onOpenChange,
  onPick,
}: SavedAddressesSheetProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return MOCK_SAVED_ADDRESSES;
    const q = search.trim().toLowerCase();
    return MOCK_SAVED_ADDRESSES.filter(
      (r) =>
        r.recipientName.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q) ||
        r.detail.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <IconMapPin size={16} />
            管理常用地址
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            揀一個地址作為收件人；於「常用地址」頁可新增 / 編輯。
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-3 border-b">
          <div className="relative">
            <IconSearch
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋姓名 / 地區 / 地址…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              無符合條件嘅地址
            </div>
          )}
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onPick(r);
                onOpenChange(false);
              }}
              className="block w-full text-left border-b border-border px-6 py-3 hover:bg-muted/20"
            >
              <div className="flex items-center gap-2">
                <div className="text-[13px] font-medium">{r.recipientName}</div>
                {r.default && (
                  <span className="rounded-full bg-[hsl(var(--brand-soft))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--brand-strong))]">
                    預設
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {r.region} · {r.detail}
              </div>
              <div className="mt-0.5 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                {r.phone}
              </div>
            </button>
          ))}
        </div>

        <SheetFooter className="border-t bg-background px-6 py-3 flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button variant="outline" size="sm">
            + 新增地址
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            關閉
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ============================================================
 * Carrier accounts single-select picker
 * ==========================================================*/

interface CarrierAccountsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (carrier: CarrierAccountRow) => void;
}

export function CarrierAccountsSheet({
  open,
  onOpenChange,
  onPick,
}: CarrierAccountsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <IconTruck size={16} />
            連結 Carrier 帳號
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            揀一個已連結嘅 Carrier 帳號；運費將由呢個帳號扣除。
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto scrollbar">
          {MOCK_CARRIER_ACCOUNTS.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={!r.active}
              onClick={() => {
                onPick(r);
                onOpenChange(false);
              }}
              className={cn(
                "block w-full text-left border-b border-border px-6 py-3 transition-colors",
                r.active
                  ? "hover:bg-muted/20"
                  : "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-medium">{r.name}</div>
                {!r.active && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    未啟用
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="font-mono tabular-nums">{r.accountNo}</span>
                <span>· {r.region}</span>
              </div>
            </button>
          ))}
        </div>

        <SheetFooter className="border-t bg-background px-6 py-3 flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button variant="outline" size="sm">
            + 連結新帳號
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            關閉
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

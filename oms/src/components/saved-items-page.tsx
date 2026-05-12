"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { IconBookmarks } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

interface Category {
  _id: string;
  name_zh: string;
  subcategories: { _id: string; name_zh: string }[];
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
  last_used_at: string | null;
}

const emptyForm = {
  category_id: "",
  subcategory_id: "",
  product_name: "",
  product_url: "",
  default_quantity: 1,
  default_unit_price: 0,
};

export const SavedItemsPage = () => {
  const t = useTranslations();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [sort, setSort] = useState<"recent" | "used" | "name">("recent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (filterCat) qs.set("category_id", filterCat);
    qs.set("sort", sort);
    const r = await http_request(
      "GET",
      `/api/cms/saved-items?${qs.toString()}`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) setItems(d.data ?? []);
    setLoading(false);
  };

  const loadCategories = async () => {
    const r = await http_request("GET", "/api/cms/product-categories", {});
    const d = await r.json();
    if (d.status === 200) setCategories(d.data ?? []);
  };

  useEffect(() => {
    loadCategories();
  }, []);
  useEffect(() => {
    load();
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterCat, sort]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
    setOpen(true);
  };
  const openEdit = (it: SavedItem) => {
    setEditingId(it._id);
    setForm({
      category_id: it.category_id,
      subcategory_id: it.subcategory_id,
      product_name: it.product_name,
      product_url: it.product_url ?? "",
      default_quantity: it.default_quantity,
      default_unit_price: it.default_unit_price,
    });
    setError("");
    setOpen(true);
  };

  const formCategory = useMemo(
    () => categories.find((c) => c._id === form.category_id),
    [categories, form.category_id]
  );

  const save = async () => {
    setError("");
    if (
      !form.category_id ||
      !form.subcategory_id ||
      !form.product_name ||
      form.default_quantity < 1 ||
      form.default_unit_price < 0
    ) {
      setError(t("saved_items.error_required"));
      return;
    }
    const body = {
      category_id: form.category_id,
      subcategory_id: form.subcategory_id,
      product_name: form.product_name,
      product_url: form.product_url || undefined,
      default_quantity: form.default_quantity,
      default_unit_price: form.default_unit_price,
    };
    const url = editingId
      ? `/api/cms/saved-items/${editingId}`
      : "/api/cms/saved-items";
    const method = editingId ? "PATCH" : "POST";
    const r = await http_request(method as any, url, body);
    const d = await r.json();
    if (d.status === 200) {
      setFlash(editingId ? t("saved_items.updated") : t("saved_items.created"));
      setOpen(false);
      load();
    } else setError(d.message ?? "fail");
  };

  const del = async (it: SavedItem) => {
    if (!confirm(t("saved_items.delete_confirm", { name: it.product_name })))
      return;
    const r = await http_request(
      "DELETE",
      `/api/cms/saved-items/${it._id}`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) {
      setFlash(t("saved_items.deleted"));
      load();
    } else setError(d.message ?? "fail");
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!confirm(t("saved_items.bulk_delete_confirm", { n: ids.length })))
      return;
    const r = await http_request("POST", "/api/cms/saved-items/bulk", {
      action: "delete",
      ids,
    });
    const d = await r.json();
    if (d.status === 200) {
      setFlash(t("saved_items.deleted"));
      setSelectedIds(new Set());
      load();
    }
  };

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i._id))
    );

  const catName = (it: SavedItem) => {
    const c = categories.find((c) => c._id === it.category_id);
    const s = c?.subcategories.find((s) => s._id === it.subcategory_id);
    return `${c?.name_zh ?? it.category_id} · ${s?.name_zh ?? it.subcategory_id}`;
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 grid gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <IconBookmarks size={24} />
            {t("saved_items.page_title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("saved_items.page_subtitle")}
          </p>
        </div>
        <Button onClick={openCreate}>{t("saved_items.new_btn")}</Button>
      </div>

      {flash && <p className="text-sm text-emerald-700">{flash}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("saved_items.search_placeholder")}
          className="max-w-xs"
        />
        <select
          className="border rounded h-9 px-2 text-sm"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
        >
          <option value="">{t("saved_items.filter_all_categories")}</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name_zh}
            </option>
          ))}
        </select>
        <select
          className="border rounded h-9 px-2 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
        >
          <option value="recent">{t("saved_items.sort_recent")}</option>
          <option value="used">{t("saved_items.sort_used")}</option>
          <option value="name">{t("saved_items.sort_name")}</option>
        </select>
        <div className="ml-auto text-xs text-gray-500">
          {t("saved_items.stat_count", { n: items.length })}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-12">
          {t("common.loading")}
        </p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center text-gray-500">
            <IconBookmarks size={36} className="text-gray-300 mb-2" />
            <p className="mb-4">{t("saved_items.empty")}</p>
            <Button onClick={openCreate}>{t("saved_items.new_btn")}</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="p-2 w-8 text-left">
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.size > 0 && selectedIds.size === items.length
                      }
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="p-2 text-left w-[20%]">
                    {t("saved_items.col_category")}
                  </th>
                  <th className="p-2 text-left">{t("saved_items.col_product")}</th>
                  <th className="p-2 text-right w-[8%]">
                    {t("saved_items.col_qty")}
                  </th>
                  <th className="p-2 text-right w-[12%]">
                    {t("saved_items.col_price")}
                  </th>
                  <th className="p-2 text-left w-[16%]">
                    {t("saved_items.col_used")}
                  </th>
                  <th className="p-2 w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it._id} className="border-t">
                    <td className="p-2 align-top">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(it._id)}
                        onChange={() => toggleOne(it._id)}
                      />
                    </td>
                    <td className="p-2 align-top">{catName(it)}</td>
                    <td className="p-2 align-top">
                      <div className="font-medium">{it.product_name}</div>
                      {it.product_url && (
                        <div className="text-xs text-gray-500 truncate max-w-md">
                          {it.product_url}
                        </div>
                      )}
                    </td>
                    <td className="p-2 align-top text-right">
                      {it.default_quantity}
                    </td>
                    <td className="p-2 align-top text-right">
                      {it.default_unit_price.toLocaleString()}
                    </td>
                    <td className="p-2 align-top">
                      <Badge variant="secondary" className="text-xs">
                        {t("saved_items.used_count", { n: it.used_count })}
                      </Badge>
                      {it.last_used_at && (
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(it.last_used_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="p-2 align-top text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(it)}
                      >
                        {t("saved_items.edit_btn")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => del(it)}
                      >
                        {t("saved_items.delete_btn")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 p-3 border-t bg-gray-50">
                <span className="text-sm">
                  {t("saved_items.selected_count", { n: selectedIds.size })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600"
                  onClick={bulkDelete}
                >
                  {t("saved_items.bulk_delete_btn")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t("saved_items.edit_title")
                : t("saved_items.new_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("saved_items.field_category")}</Label>
                <select
                  className="w-full border rounded h-9 px-2 text-sm"
                  value={form.category_id}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      category_id: e.target.value,
                      subcategory_id: "",
                    })
                  }
                >
                  <option value="">{t("saved_items.select_category")}</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name_zh}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("saved_items.field_subcategory")}</Label>
                <select
                  className="w-full border rounded h-9 px-2 text-sm"
                  value={form.subcategory_id}
                  onChange={(e) =>
                    setForm({ ...form, subcategory_id: e.target.value })
                  }
                  disabled={!formCategory}
                >
                  <option value="">
                    {formCategory
                      ? t("saved_items.select_subcategory")
                      : t("saved_items.select_category_first")}
                  </option>
                  {formCategory?.subcategories.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name_zh}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>{t("saved_items.field_name")}</Label>
              <Input
                value={form.product_name}
                onChange={(e) =>
                  setForm({ ...form, product_name: e.target.value })
                }
                maxLength={200}
              />
            </div>
            <div>
              <Label>{t("saved_items.field_url")}</Label>
              <Input
                type="url"
                value={form.product_url}
                onChange={(e) =>
                  setForm({ ...form, product_url: e.target.value })
                }
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("saved_items.field_default_qty")}</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={form.default_quantity || ""}
                  placeholder="1"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      default_quantity: parseInt(e.target.value, 10) || 1,
                    })
                  }
                />
              </div>
              <div>
                <Label>{t("saved_items.field_default_price")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={form.default_unit_price || ""}
                  placeholder="0"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      default_unit_price: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save}>{t("saved_items.save_btn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

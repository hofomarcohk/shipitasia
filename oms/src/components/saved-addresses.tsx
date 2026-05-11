"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { IconMapPin } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

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
  createdAt: string;
}

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

const HK_DISTRICTS = [
  "中西區", "灣仔", "東區", "南區",
  "油尖旺", "深水埗", "九龍城", "黃大仙", "觀塘",
  "葵青", "荃灣", "屯門", "元朗", "北區", "大埔", "沙田", "西貢", "離島",
];

const emptyForm = {
  label: "",
  name: "",
  phone: "",
  country_code: "HK",
  city: "",
  district: "",
  address: "",
  postal_code: "",
  is_default: false,
};

export const SavedAddressesPage = () => {
  const t = useTranslations();
  const [items, setItems] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await http_request("GET", "/api/cms/saved-addresses", {});
    const d = await r.json();
    if (d.status === 200) setItems(d.data ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
    setOpen(true);
  };
  const openEdit = (a: SavedAddress) => {
    setEditingId(a._id);
    setForm({
      label: a.label,
      name: a.name,
      phone: a.phone,
      country_code: a.country_code,
      city: a.city,
      district: a.district ?? "",
      address: a.address,
      postal_code: a.postal_code ?? "",
      is_default: a.is_default,
    });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    setError("");
    if (!form.label || !form.name || !form.phone || !form.city || !form.address) {
      setError(t("addresses.error_required"));
      return;
    }
    const body = {
      ...form,
      district: form.district || undefined,
      postal_code: form.postal_code || undefined,
    };
    const url = editingId
      ? `/api/cms/saved-addresses/${editingId}`
      : "/api/cms/saved-addresses";
    const method = editingId ? "PATCH" : "POST";
    const r = await http_request(method as any, url, body);
    const d = await r.json();
    if (d.status === 200) {
      setFlash(
        editingId ? t("addresses.updated") : t("addresses.created")
      );
      setOpen(false);
      load();
    } else {
      setError(d.message ?? "fail");
    }
  };

  const del = async (a: SavedAddress) => {
    if (!confirm(t("addresses.delete_confirm", { label: a.label }))) return;
    const r = await http_request(
      "DELETE",
      `/api/cms/saved-addresses/${a._id}`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) {
      setFlash(t("addresses.deleted"));
      load();
    } else setError(d.message ?? "fail");
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <IconMapPin size={24} />
            {t("addresses.page_title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("addresses.page_subtitle")}
          </p>
        </div>
        <Button onClick={openCreate}>{t("addresses.new_btn")}</Button>
      </div>

      {flash && <p className="text-sm text-emerald-700">{flash}</p>}

      {loading ? (
        <p className="text-center text-gray-500 py-12">
          {t("common.loading")}
        </p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center text-gray-500">
            <IconMapPin size={36} className="text-gray-300 mb-2" />
            <p className="mb-4">{t("addresses.empty")}</p>
            <Button onClick={openCreate}>{t("addresses.new_btn")}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => (
            <Card key={a._id}>
              <CardContent className="flex items-start justify-between p-4">
                <div className="grid gap-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{a.label}</span>
                    {a.is_default && (
                      <Badge variant="default" className="text-xs">
                        {t("addresses.default")}
                      </Badge>
                    )}
                  </div>
                  <div>
                    {a.name} · {DIAL_CODES[a.country_code] ?? "+"}
                    {a.phone}
                  </div>
                  <div className="text-xs text-gray-600">
                    {a.country_code} · {a.city}
                    {a.district ? ` · ${a.district}` : ""}
                  </div>
                  <div className="text-xs text-gray-600">{a.address}</div>
                  {a.postal_code && (
                    <div className="text-xs text-gray-500">
                      {a.postal_code}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(a)}
                  >
                    {t("addresses.edit_btn")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => del(a)}
                  >
                    {t("addresses.delete_btn")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t("addresses.edit_title") : t("addresses.new_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>{t("addresses.label")}</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="家 / 公司 / 倉庫"
                maxLength={50}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("addresses.name")}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("addresses.phone")}</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-2 border border-r-0 rounded-l bg-gray-50 text-sm text-gray-600">
                    {DIAL_CODES[form.country_code] ?? "+"}
                  </span>
                  <Input
                    value={form.phone}
                    className="rounded-l-none"
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>{t("addresses.country")}</Label>
                <select
                  className="w-full border rounded h-9 px-2 text-sm"
                  value={form.country_code}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      country_code: e.target.value,
                      district: e.target.value === "HK" ? form.district : "",
                    })
                  }
                >
                  {Object.keys(DIAL_CODES).map((c) => (
                    <option key={c} value={c}>
                      {c} ({DIAL_CODES[c]})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("addresses.city")}</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("addresses.district")}</Label>
                {form.country_code === "HK" ? (
                  <select
                    className="w-full border rounded h-9 px-2 text-sm"
                    value={form.district}
                    onChange={(e) =>
                      setForm({ ...form, district: e.target.value })
                    }
                  >
                    <option value="">—</option>
                    {HK_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={form.district}
                    onChange={(e) =>
                      setForm({ ...form, district: e.target.value })
                    }
                  />
                )}
              </div>
              <div>
                <Label>{t("addresses.postal")}</Label>
                <Input
                  value={form.postal_code}
                  onChange={(e) =>
                    setForm({ ...form, postal_code: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>{t("addresses.address")}</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) =>
                  setForm({ ...form, is_default: e.target.checked })
                }
              />
              {t("addresses.set_default")}
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save}>{t("addresses.save_btn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

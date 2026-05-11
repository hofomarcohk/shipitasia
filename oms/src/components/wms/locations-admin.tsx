"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Warehouse {
  warehouseCode: string;
  name_zh: string;
}

interface LocationRow {
  warehouseCode: string;
  locationCode: string;
  zone: string;
  display_order: number;
  note: string | null;
  status: "active" | "disabled";
  createdAt: string | null;
}

const ZONE_OPTIONS = ["storage", "staging", "inbound", "outbound", "quarantine"];

export const LocationsAdmin = () => {
  const t = useTranslations();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [wh, setWh] = useState<string>("");
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [loading, setLoading] = useState(false);

  // New-row form state
  const [newCode, setNewCode] = useState("");
  const [newZone, setNewZone] = useState("storage");
  const [newOrder, setNewOrder] = useState("100");
  const [newNote, setNewNote] = useState("");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const r = await http_request("GET", "/api/cms/warehouses", {});
      const d = await r.json();
      if (d.status === 200) {
        setWarehouses(d.data ?? []);
        if (!wh && d.data?.[0]) setWh(d.data[0].warehouseCode);
      }
    })();
  }, []);

  const reload = async () => {
    if (!wh) return;
    setLoading(true);
    const r = await http_request("GET", "/api/cms/admin/locations", {
      warehouseCode: wh,
      include_disabled: includeDisabled ? "1" : "0",
    });
    const d = await r.json();
    if (d.status === 200) setRows(d.data);
    setLoading(false);
  };
  useEffect(() => {
    reload();
  }, [wh, includeDisabled]);

  const create = async () => {
    setError("");
    if (!newCode.trim()) {
      setError(t("wms_locations.error_code_required"));
      return;
    }
    const r = await http_request("POST", "/api/cms/admin/locations", {
      warehouseCode: wh,
      locationCode: newCode.trim().toUpperCase(),
      zone: newZone,
      display_order: Number(newOrder) || 100,
      note: newNote || undefined,
    });
    const d = await r.json();
    if (d.status === 200) {
      setFlash(t("wms_locations.created", { code: d.data.locationCode }));
      setNewCode("");
      setNewNote("");
      reload();
    } else {
      setError(d.message ?? "create failed");
    }
  };

  const toggleStatus = async (row: LocationRow) => {
    const next = row.status === "active" ? "disabled" : "active";
    const r = await http_request(
      "PATCH",
      `/api/cms/admin/locations/${encodeURIComponent(row.warehouseCode)}/${encodeURIComponent(row.locationCode)}`,
      { status: next }
    );
    const d = await r.json();
    if (d.status === 200) reload();
    else setError(d.message ?? "fail");
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-2xl font-semibold">
              {t("wms_locations.page_title")}
            </h1>
            <div className="flex items-center gap-3 text-sm">
              <Label className="text-sm">{t("wms_locations.warehouse")}</Label>
              <select
                className="border rounded h-9 px-2 text-sm"
                value={wh}
                onChange={(e) => setWh(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.warehouseCode} value={w.warehouseCode}>
                    {w.name_zh} ({w.warehouseCode})
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={includeDisabled}
                  onChange={(e) => setIncludeDisabled(e.target.checked)}
                />
                {t("wms_locations.include_disabled")}
              </label>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">{t("wms_locations.new_title")}</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-3">
              <Label>{t("wms_locations.code")}</Label>
              <Input
                placeholder="A001"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="col-span-3">
              <Label>{t("wms_locations.zone")}</Label>
              <select
                className="w-full border rounded h-9 px-2"
                value={newZone}
                onChange={(e) => setNewZone(e.target.value)}
              >
                {ZONE_OPTIONS.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <Label>{t("wms_locations.order")}</Label>
              <Input
                type="number"
                value={newOrder}
                onChange={(e) => setNewOrder(e.target.value)}
              />
            </div>
            <div className="col-span-3">
              <Label>{t("wms_locations.note")}</Label>
              <Input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
            </div>
            <Button className="col-span-1" onClick={create}>
              {t("wms_locations.add_btn")}
            </Button>
          </div>
          {flash && <p className="text-sm text-emerald-700 mt-2">{flash}</p>}
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-gray-500 text-center py-8">
              {t("common.loading")}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              {t("wms_locations.empty")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="py-2 px-3">{t("wms_locations.code")}</th>
                  <th className="py-2 px-3">{t("wms_locations.zone")}</th>
                  <th className="py-2 px-3 text-right">
                    {t("wms_locations.order")}
                  </th>
                  <th className="py-2 px-3">{t("wms_locations.note")}</th>
                  <th className="py-2 px-3">{t("wms_locations.status")}</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.locationCode} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono">{r.locationCode}</td>
                    <td className="py-2 px-3">{r.zone}</td>
                    <td className="py-2 px-3 text-right">{r.display_order}</td>
                    <td className="py-2 px-3 text-xs text-gray-600">
                      {r.note ?? "—"}
                    </td>
                    <td className="py-2 px-3">
                      <Badge
                        variant={r.status === "active" ? "default" : "outline"}
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleStatus(r)}
                      >
                        {r.status === "active"
                          ? t("wms_locations.disable_btn")
                          : t("wms_locations.enable_btn")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

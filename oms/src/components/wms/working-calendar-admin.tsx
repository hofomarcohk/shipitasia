"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Warehouse {
  warehouseCode: string;
  name_zh: string;
}

interface Entry {
  warehouseCode: string;
  date: string;
  type: "holiday" | "non_working";
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

const TYPE_OPTIONS: Array<{ value: "holiday" | "non_working" }> = [
  { value: "holiday" },
  { value: "non_working" },
];

export const WorkingCalendarAdmin = () => {
  const t = useTranslations();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [wh, setWh] = useState<string>("");
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  const [newDate, setNewDate] = useState("");
  const [newType, setNewType] = useState<"holiday" | "non_working">("holiday");
  const [newLabel, setNewLabel] = useState("");

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
    setError("");
    const r = await http_request(
      "GET",
      `/api/wms/working-calendars?warehouseCode=${encodeURIComponent(wh)}`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) setRows(d.data ?? []);
    else setError(d.message || "Failed to load");
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, [wh]);

  const submitEntry = async () => {
    setError("");
    setFlash("");
    if (!wh) {
      setError(t("wms_working_calendar.error_no_warehouse"));
      return;
    }
    if (!newDate) {
      setError(t("wms_working_calendar.error_no_date"));
      return;
    }
    const r = await http_request("POST", "/api/wms/working-calendars", {
      warehouseCode: wh,
      date: newDate,
      type: newType,
      label: newLabel,
    });
    const d = await r.json();
    if (d.status === 200) {
      setFlash(t("wms_working_calendar.flash_saved"));
      setNewDate("");
      setNewLabel("");
      reload();
    } else {
      setError(d.message || "Failed to save");
    }
  };

  const removeEntry = async (row: Entry) => {
    if (
      !confirm(
        t("wms_working_calendar.confirm_delete", { date: row.date })
      )
    )
      return;
    const r = await http_request(
      "DELETE",
      `/api/wms/working-calendars/${encodeURIComponent(
        row.warehouseCode
      )}/${encodeURIComponent(row.date)}`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) {
      reload();
    } else {
      setError(d.message || "Failed to delete");
    }
  };

  const today = new Date();
  const grouped = groupByMonth(rows);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-semibold">
              {t("wms_working_calendar.page_title")}
            </h2>
            <div className="flex items-center gap-2">
              <Label className="text-sm">
                {t("wms_working_calendar.warehouse_label")}
              </Label>
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-3">
            {t("wms_working_calendar.intro")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <div>
              <Label className="text-xs">
                {t("wms_working_calendar.field_date")}
              </Label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">
                {t("wms_working_calendar.field_type")}
              </Label>
              <select
                className="border rounded h-9 px-2 text-sm w-full"
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as "holiday" | "non_working")
                }
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(`wms_working_calendar.type.${o.value}` as any)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">
                {t("wms_working_calendar.field_label")}
              </Label>
              <Input
                placeholder={t("wms_working_calendar.field_label_placeholder")}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
            <div>
              <Button onClick={submitEntry} className="w-full">
                {t("wms_working_calendar.add_btn")}
              </Button>
            </div>
          </div>
          {flash && <div className="text-green-700 text-sm mt-2">{flash}</div>}
          {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-sm">
            {t("wms_working_calendar.list_title")}
          </h3>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-gray-500">{t("common.loading")}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-500">
              {t("wms_working_calendar.empty")}
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([month, items]) => (
                <div key={month}>
                  <div className="text-xs font-semibold text-gray-500 mb-1">
                    {month}
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left py-2 px-3 w-28">
                          {t("wms_working_calendar.col_date")}
                        </th>
                        <th className="text-left py-2 px-3 w-24">
                          {t("wms_working_calendar.col_type")}
                        </th>
                        <th className="text-left py-2 px-3">
                          {t("wms_working_calendar.col_label")}
                        </th>
                        <th className="text-right py-2 px-3 w-24">
                          {t("wms_working_calendar.col_actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r) => (
                        <tr
                          key={`${r.warehouseCode}_${r.date}`}
                          className={`border-t ${
                            r.date < toYmd(today)
                              ? "text-gray-400"
                              : ""
                          }`}
                        >
                          <td className="py-2 px-3 font-mono text-xs">
                            {r.date}
                          </td>
                          <td className="py-2 px-3">
                            {t(`wms_working_calendar.type.${r.type}` as any)}
                          </td>
                          <td className="py-2 px-3">{r.label ?? "—"}</td>
                          <td className="py-2 px-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => removeEntry(r)}
                            >
                              {t("wms_working_calendar.delete_btn")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function groupByMonth(rows: Entry[]): Array<[string, Entry[]]> {
  const map = new Map<string, Entry[]>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

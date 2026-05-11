"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface OutboundRow {
  _id: string;
  carrier_code: string;
  destination_country: string;
  inbound_count: number;
  status: string;
  boxes: { box_no: string; status: string }[];
}

export const OperationsDepart = () => {
  const t = useTranslations();
  const [list, setList] = useState<OutboundRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  const reload = async () => {
    const r = await http_request("GET", "/api/wms/outbound/departable", {});
    const d = await r.json();
    if (d.status === 200) setList(d.data ?? []);
  };
  useEffect(() => {
    reload();
  }, []);

  const departAll = async (id: string) => {
    setError("");
    setFlash("");
    setBusyId(id);
    try {
      const r = await http_request(
        "POST",
        `/api/wms/outbound/${id}/depart-all`,
        {}
      );
      const d = await r.json();
      if (d.status === 200) {
        setFlash(
          `${id} · ${t("wms_ops.depart.done", {
            count: d.data.departed_count,
          })}`
        );
        await reload();
      } else {
        setError(d.message ?? "fail");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 grid gap-4">
      {list.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            {t("wms_ops.depart.empty")}
          </CardContent>
        </Card>
      )}
      {list.map((o) => {
        const pending = o.boxes.filter((b) => b.status === "label_printed");
        return (
          <Card key={o._id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold">
                  <span className="font-mono">{o._id}</span> ·{" "}
                  {o.carrier_code} → {o.destination_country} · {o.inbound_count}{" "}
                  件
                </h2>
                <Button
                  onClick={() => departAll(o._id)}
                  disabled={busyId === o._id || pending.length === 0}
                >
                  {busyId === o._id
                    ? t("wms_ops.depart.depart_running")
                    : t("wms_ops.depart.depart_all_btn", {
                        count: pending.length,
                      })}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex flex-wrap gap-1">
                {o.boxes.map((b) => (
                  <span
                    key={b.box_no}
                    className={
                      "font-mono text-xs px-2 py-0.5 rounded border " +
                      (b.status === "label_printed"
                        ? "border-gray-300"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700")
                    }
                    title={b.status}
                  >
                    {b.box_no}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {flash && <p className="text-sm text-emerald-700">{flash}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

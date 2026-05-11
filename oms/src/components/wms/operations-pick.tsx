"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface OutboundRow {
  _id: string;
  carrier_code: string;
  destination_country: string;
  inbound_count: number;
  status: string;
  createdAt: string;
}

interface InboundRow {
  _id: string;
  tracking_no: string;
  status: string;
  actualWeight: number | null;
  locationCode: string | null;
}

export const OperationsPick = () => {
  const t = useTranslations();
  const [list, setList] = useState<OutboundRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboundRow[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  const reloadList = async () => {
    const r = await http_request("GET", "/api/wms/outbound/pickable", {});
    const d = await r.json();
    if (d.status === 200) setList(d.data ?? []);
  };

  const loadDetail = async (id: string) => {
    setLoading(true);
    setSelected(id);
    setDetail([]);
    setPicked([]);
    const r = await http_request(
      "GET",
      `/api/wms/outbound/${id}/pick-detail`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) {
      setDetail(d.data.inbounds);
    }
    setLoading(false);
  };

  useEffect(() => {
    reloadList();
  }, []);

  const doBatchPick = async () => {
    if (!selected || picked.length === 0) return;
    setError("");
    const r = await http_request(
      "POST",
      `/api/wms/outbound/${selected}/pick-batch`,
      { inbound_ids: picked }
    );
    const d = await r.json();
    if (d.status === 200) {
      setFlash(`已揀 ${d.data.picked} 件`);
      await reloadList();
      await loadDetail(selected);
    } else {
      setError(d.message ?? "fail");
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 grid grid-cols-3 gap-4">
      <Card className="col-span-1">
        <CardHeader>
          <h2 className="font-semibold">{t("wms_ops.pick.list_title")}</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {list.length === 0 ? (
            <p className="text-sm text-gray-500">{t("wms_ops.pick.empty")}</p>
          ) : (
            list.map((o) => (
              <button
                key={o._id}
                onClick={() => loadDetail(o._id)}
                className={`w-full text-left border rounded p-2 hover:bg-gray-50 ${
                  selected === o._id ? "border-blue-500 bg-blue-50" : ""
                }`}
              >
                <div className="font-mono text-xs">{o._id}</div>
                <div className="text-xs text-gray-500">
                  {o.carrier_code} → {o.destination_country} · {o.inbound_count}{" "}
                  件 · {o.status}
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="col-span-2">
        <CardHeader>
          <h2 className="font-semibold">
            {selected
              ? `${selected} — ${t("wms_ops.pick.detail_title")}`
              : t("wms_ops.pick.choose_prompt")}
          </h2>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="text-gray-500">{t("common.loading")}</p>
          )}
          {!selected && (
            <p className="text-gray-500">{t("wms_ops.pick.choose_prompt")}</p>
          )}
          {detail.length > 0 && (
            <div className="grid gap-2">
              {detail.map((i) => {
                const isPicked = i.status !== "received";
                return (
                  <label
                    key={i._id}
                    className={`flex items-center gap-3 border rounded p-2 ${
                      isPicked ? "bg-gray-100 opacity-60" : ""
                    }`}
                  >
                    <Checkbox
                      disabled={isPicked}
                      checked={picked.includes(i._id) || isPicked}
                      onCheckedChange={(v) =>
                        setPicked((prev) =>
                          v ? [...prev, i._id] : prev.filter((x) => x !== i._id)
                        )
                      }
                    />
                    <div className="flex-1">
                      <div className="font-mono text-xs">{i._id}</div>
                      <div className="text-xs text-gray-500">
                        {i.tracking_no} ·{" "}
                        {i.locationCode
                          ? `庫位 ${i.locationCode}`
                          : "庫位 ?"}{" "}
                        ·{" "}
                        {i.actualWeight
                          ? `${i.actualWeight}kg`
                          : "weight TBD"}{" "}
                        · {i.status}
                      </div>
                    </div>
                  </label>
                );
              })}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setPicked(
                      detail
                        .filter((i) => i.status === "received")
                        .map((i) => i._id)
                    )
                  }
                >
                  {t("wms_ops.pick.select_all")}
                </Button>
                <Button onClick={doBatchPick} disabled={picked.length === 0}>
                  {t("wms_ops.pick.batch_pick_btn", { count: picked.length })}
                </Button>
              </div>
            </div>
          )}
          {flash && <p className="mt-3 text-sm text-emerald-700">{flash}</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
};

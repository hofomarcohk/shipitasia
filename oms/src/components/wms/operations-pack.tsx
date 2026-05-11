"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface OutboundRow {
  _id: string;
  carrier_code: string;
  destination_country: string;
  inbound_count: number;
  status: string;
}

interface PickInbound {
  _id: string;
  tracking_no: string;
  status: string;
  actualWeight: number | null;
}

interface BoxRow {
  _id: string;
  box_no: string;
  dimensions: { length: number; width: number; height: number };
  weight_estimate: number;
  status: string;
}

export const OperationsPack = () => {
  const t = useTranslations();
  const [list, setList] = useState<OutboundRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [inbounds, setInbounds] = useState<PickInbound[]>([]);
  const [boxes, setBoxes] = useState<BoxRow[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [estWeight, setEstWeight] = useState("");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  const reload = async () => {
    const r = await http_request("GET", "/api/wms/outbound/packable", {});
    const d = await r.json();
    if (d.status === 200) setList(d.data ?? []);
  };
  const loadDetail = async (id: string) => {
    setSelected(id);
    setChosen([]);
    setFlash("");
    setError("");
    const [pd, bx] = await Promise.all([
      http_request("GET", `/api/wms/outbound/${id}/pick-detail`, {}),
      http_request("GET", `/api/wms/outbound/${id}/box`, {}),
    ]);
    const pdJ = await pd.json();
    const bxJ = await bx.json();
    if (pdJ.status === 200) setInbounds(pdJ.data.inbounds);
    if (bxJ.status === 200) setBoxes(bxJ.data);
  };
  useEffect(() => {
    reload();
  }, []);

  const boxedIds = new Set<string>();
  for (const b of boxes) {
    // We don't have box→inbound links in the box list payload; v1 keeps it
    // simple: an inbound is boxed when status=packed.
  }
  const unboxedInbounds = inbounds.filter((i) => i.status === "picking");

  const submitBox = async () => {
    if (!selected || chosen.length === 0) {
      setError(t("wms_ops.pack.error_pick_first"));
      return;
    }
    const L = Number(length),
      W = Number(width),
      H = Number(height),
      E = Number(estWeight);
    if (!L || !W || !H || !E) {
      setError(t("wms_ops.pack.error_dimensions"));
      return;
    }
    setError("");
    const r = await http_request(
      "POST",
      `/api/wms/outbound/${selected}/box`,
      {
        inbound_ids: chosen,
        dimensions: { length: L, width: W, height: H },
        weight_estimate: E,
      }
    );
    const d = await r.json();
    if (d.status === 200) {
      setFlash(`已建箱 ${d.data.box_no}`);
      setChosen([]);
      setLength("");
      setWidth("");
      setHeight("");
      setEstWeight("");
      await loadDetail(selected);
    } else {
      setError(d.message ?? "fail");
    }
  };

  const completePack = async () => {
    if (!selected) return;
    const r = await http_request(
      "POST",
      `/api/wms/outbound/${selected}/pack-complete`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) {
      setFlash(t("wms_ops.pack.complete_ok"));
      await reload();
      setSelected(null);
      setInbounds([]);
      setBoxes([]);
    } else {
      setError(d.message ?? "fail");
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 grid grid-cols-12 gap-4">
      <Card className="col-span-3">
        <CardHeader>
          <h2 className="font-semibold">{t("wms_ops.pack.list_title")}</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {list.map((o) => (
            <button
              key={o._id}
              onClick={() => loadDetail(o._id)}
              className={`w-full text-left border rounded p-2 hover:bg-gray-50 ${
                selected === o._id ? "border-blue-500 bg-blue-50" : ""
              }`}
            >
              <div className="font-mono text-xs">{o._id}</div>
              <div className="text-xs text-gray-500">{o.status} · {o.inbound_count} 件</div>
            </button>
          ))}
          {list.length === 0 && (
            <p className="text-sm text-gray-500">{t("wms_ops.pack.empty")}</p>
          )}
        </CardContent>
      </Card>

      <Card className="col-span-6">
        <CardHeader>
          <h2 className="font-semibold">
            {selected ? `${selected} — ${t("wms_ops.pack.box_title")}` : t("wms_ops.pack.choose")}
          </h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selected && <p className="text-gray-500">{t("wms_ops.pack.choose")}</p>}
          {selected && (
            <>
              <div className="border rounded p-3">
                <p className="font-medium mb-2">{t("wms_ops.pack.waiting_inbound")}</p>
                {unboxedInbounds.length === 0 ? (
                  <p className="text-sm text-gray-500">{t("wms_ops.pack.all_boxed")}</p>
                ) : (
                  <div className="grid gap-1">
                    {unboxedInbounds.map((i) => (
                      <label
                        key={i._id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={chosen.includes(i._id)}
                          onCheckedChange={(v) =>
                            setChosen((prev) =>
                              v
                                ? [...prev, i._id]
                                : prev.filter((x) => x !== i._id)
                            )
                          }
                        />
                        <span className="font-mono text-xs">{i._id}</span>
                        <span className="text-xs text-gray-500">
                          {i.tracking_no}
                          {i.actualWeight ? ` · ${i.actualWeight}kg` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="border rounded p-3">
                <p className="font-medium mb-2">{t("wms_ops.pack.box_dim")}</p>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div>
                    <Label>L cm</Label>
                    <Input value={length} onChange={(e) => setLength(e.target.value)} />
                  </div>
                  <div>
                    <Label>W cm</Label>
                    <Input value={width} onChange={(e) => setWidth(e.target.value)} />
                  </div>
                  <div>
                    <Label>H cm</Label>
                    <Input value={height} onChange={(e) => setHeight(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("wms_ops.pack.est_weight")}</Label>
                    <Input
                      value={estWeight}
                      onChange={(e) => setEstWeight(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button onClick={submitBox}>{t("wms_ops.pack.create_box_btn")}</Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={completePack}
                  disabled={unboxedInbounds.length > 0}
                >
                  {t("wms_ops.pack.complete_all_btn")}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="col-span-3">
        <CardHeader>
          <h2 className="font-semibold">{t("wms_ops.pack.boxes_title")}</h2>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {boxes.length === 0 && <p className="text-gray-500">—</p>}
          {boxes.map((b) => (
            <div key={b._id} className="border rounded p-2">
              <div className="font-mono">{b.box_no}</div>
              <div className="text-xs text-gray-500">
                {b.dimensions.length}×{b.dimensions.width}×{b.dimensions.height} cm,
                {" "}est {b.weight_estimate}kg · {b.status}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {flash && (
        <div className="col-span-12 text-sm text-emerald-700">{flash}</div>
      )}
      {error && (
        <div className="col-span-12 text-sm text-red-600">{error}</div>
      )}
    </div>
  );
};

"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface OutboundRow {
  _id: string;
  status: string;
  inbound_count: number;
}

interface BoxRow {
  _id: string;
  box_no: string;
  dimensions: { length: number; width: number; height: number };
  weight_estimate: number;
  weight_actual: number | null;
  tare_weight: number | null;
  weight_diff: number | null;
  weight_diff_passed: boolean | null;
  status: string;
}

interface PalletInfo {
  _id: string;
  pallet_no: string;
  outbound_id: string;
  client_id: string;
  box_count: number;
  total_weight_kg: number;
  carrier_code: string;
  destination_country: string;
  printed_at: string;
  reprint_count: number;
}

export const OperationsWeigh = () => {
  const t = useTranslations();
  const [list, setList] = useState<OutboundRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<BoxRow[]>([]);
  const [inputs, setInputs] = useState<
    Record<string, { actual: string; tare: string }>
  >({});
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [pallet, setPallet] = useState<PalletInfo | null>(null);

  const reload = async () => {
    const r = await http_request("GET", "/api/wms/outbound/weighable", {});
    const d = await r.json();
    if (d.status === 200) setList(d.data ?? []);
  };
  const loadBoxes = async (id: string) => {
    setSelected(id);
    setFlash("");
    setError("");
    const r = await http_request("GET", `/api/wms/outbound/${id}/box`, {});
    const d = await r.json();
    if (d.status === 200) {
      setBoxes(d.data);
      const init: any = {};
      for (const b of d.data) {
        init[b.box_no] = {
          actual: b.weight_actual ? String(b.weight_actual) : "",
          tare: b.tare_weight ? String(b.tare_weight) : "0.5",
        };
      }
      setInputs(init);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const weighOne = async (box_no: string, override = false) => {
    const i = inputs[box_no];
    if (!i?.actual) {
      setError(t("wms_ops.weigh.error_actual"));
      return;
    }
    setError("");
    const r = await http_request("POST", "/api/wms/outbound/weigh", {
      box_no,
      actual_gross_weight: Number(i.actual),
      tare_weight: Number(i.tare || "0.5"),
      method: "desktop",
      override,
    });
    const d = await r.json();
    if (d.status === 200) {
      setFlash(
        `${box_no} ${d.data.tolerance_passed ? "✓ 通過" : "⚠ override"} diff=${d.data.weight_diff?.toFixed(2)}kg`
      );
      if (selected) await loadBoxes(selected);
    } else if (d.sys_code === "1800024") {
      // Tolerance exceeded — prompt override
      if (
        confirm(
          `${t("wms_ops.weigh.override_prompt")}: ${d.message ?? "diff > 0.5kg"}`
        )
      ) {
        await weighOne(box_no, true);
      }
    } else {
      setError(d.message ?? "fail");
    }
  };

  const completeWeigh = async () => {
    if (!selected) return;
    const r = await http_request(
      "POST",
      `/api/wms/outbound/${selected}/weigh-complete`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) {
      setFlash(
        d.data.auto_label_triggered
          ? t("wms_ops.weigh.complete_auto")
          : t("wms_ops.weigh.complete_pending")
      );
      // P10 — fetch the auto-minted pallet so staff can print it.
      try {
        const pr = await http_request(
          "POST",
          "/api/wms/pallet-label/print",
          { outbound_id: selected }
        );
        const pd = await pr.json();
        if (pd.status === 200) setPallet(pd.data);
      } catch {}
      await reload();
    } else {
      setError(d.message ?? "fail");
    }
  };

  const reprintPallet = async () => {
    if (!selected) return;
    const r = await http_request("POST", "/api/wms/pallet-label/print", {
      outbound_id: selected,
    });
    const d = await r.json();
    if (d.status === 200) {
      setPallet(d.data);
      setFlash(t("wms_ops.weigh.pallet_reprinted"));
    }
  };

  const dismissPallet = () => {
    setPallet(null);
    setSelected(null);
    setBoxes([]);
  };

  const allWeighed = boxes.length > 0 && boxes.every((b) => b.weight_actual);

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 grid grid-cols-12 gap-4">
      <Card className="col-span-3">
        <CardHeader>
          <h2 className="font-semibold">{t("wms_ops.weigh.list_title")}</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {list.length === 0 && (
            <p className="text-sm text-gray-500">{t("wms_ops.weigh.empty")}</p>
          )}
          {list.map((o) => (
            <button
              key={o._id}
              onClick={() => loadBoxes(o._id)}
              className={`w-full text-left border rounded p-2 hover:bg-gray-50 ${
                selected === o._id ? "border-blue-500 bg-blue-50" : ""
              }`}
            >
              <div className="font-mono text-xs">{o._id}</div>
              <div className="text-xs text-gray-500">
                {o.status} · {o.inbound_count} 件
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="col-span-9">
        <CardHeader>
          <h2 className="font-semibold">
            {selected
              ? `${selected} — ${t("wms_ops.weigh.detail_title")}`
              : t("wms_ops.weigh.choose")}
          </h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selected && (
            <p className="text-gray-500">{t("wms_ops.weigh.choose")}</p>
          )}
          {boxes.map((b) => {
            const i = inputs[b.box_no] ?? { actual: "", tare: "0.5" };
            const diff =
              b.weight_diff !== null
                ? `diff ${b.weight_diff > 0 ? "+" : ""}${b.weight_diff.toFixed(2)}kg ${b.weight_diff_passed ? "✓" : "⚠"}`
                : "";
            return (
              <div key={b._id} className="border rounded p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm">{b.box_no}</div>
                    <div className="text-xs text-gray-500">
                      預估 {b.weight_estimate}kg · {b.dimensions.length}×
                      {b.dimensions.width}×{b.dimensions.height} cm
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="w-28">
                      <Label>{t("wms_ops.weigh.actual")}</Label>
                      <Input
                        value={i.actual}
                        onChange={(e) =>
                          setInputs((p) => ({
                            ...p,
                            [b.box_no]: { ...i, actual: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="w-24">
                      <Label>{t("wms_ops.weigh.tare")}</Label>
                      <Input
                        value={i.tare}
                        onChange={(e) =>
                          setInputs((p) => ({
                            ...p,
                            [b.box_no]: { ...i, tare: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <Button onClick={() => weighOne(b.box_no)}>
                      {t("wms_ops.weigh.submit")}
                    </Button>
                  </div>
                </div>
                {b.weight_actual && (
                  <div className="text-xs text-gray-600 mt-1">
                    實重 {b.weight_actual}kg · 皮重 {b.tare_weight}kg · {diff}{" "}
                    · {b.status}
                  </div>
                )}
              </div>
            );
          })}
          {boxes.length > 0 && (
            <div className="flex justify-end pt-2">
              <Button onClick={completeWeigh} disabled={!allWeighed}>
                {t("wms_ops.weigh.complete_all")}
              </Button>
            </div>
          )}
          {pallet && (
            <div className="mt-4 border-2 border-emerald-500 rounded p-4 bg-emerald-50">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-xs text-emerald-700 font-semibold">
                    {t("wms_ops.weigh.pallet_title")}
                  </div>
                  <div className="text-2xl font-mono mt-1">
                    {pallet.pallet_no}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-600">
                  <div>{pallet.box_count} 箱 · {pallet.total_weight_kg.toFixed(2)} kg</div>
                  <div>{pallet.carrier_code} · {pallet.destination_country}</div>
                  {pallet.reprint_count > 0 && (
                    <div className="text-amber-700">
                      reprint × {pallet.reprint_count}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-700 mb-3">
                {t("wms_ops.weigh.pallet_instruction")}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => window.print()} size="sm">
                  {t("wms_ops.weigh.pallet_print_btn")}
                </Button>
                <Button onClick={reprintPallet} variant="outline" size="sm">
                  {t("wms_ops.weigh.pallet_reprint_btn")}
                </Button>
                <Button onClick={dismissPallet} variant="outline" size="sm">
                  {t("wms_ops.weigh.pallet_done_btn")}
                </Button>
              </div>
            </div>
          )}
          {flash && <p className="text-sm text-emerald-700">{flash}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
};

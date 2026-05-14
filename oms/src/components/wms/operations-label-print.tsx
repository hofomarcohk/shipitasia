"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface OutboundRow {
  _id: string;
  carrier_code: string;
  destination_country: string;
  inbound_count: number;
  status: string;
}

interface BoxRow {
  _id: string;
  box_no: string;
  label_pdf_path: string | null;
  tracking_no_carrier: string | null;
}

export const OperationsLabelPrint = () => {
  const t = useTranslations();
  const [list, setList] = useState<OutboundRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<BoxRow[]>([]);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  const [palletInput, setPalletInput] = useState("");
  const [palletFlash, setPalletFlash] = useState("");
  const palletRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    const r = await http_request(
      "GET",
      "/api/wms/outbound/label-printable",
      {}
    );
    const d = await r.json();
    if (d.status === 200) setList(d.data ?? []);
  };
  const loadBoxes = async (id: string) => {
    setOpenId(id);
    const r = await http_request("GET", `/api/wms/outbound/${id}/box`, {});
    const d = await r.json();
    if (d.status === 200) setBoxes(d.data);
  };

  const scanPallet = async () => {
    if (!palletInput.trim()) return;
    setError("");
    setPalletFlash("");
    const r = await http_request("POST", "/api/wms/pallet-label/scan-back", {
      pallet_no: palletInput.trim(),
    });
    const d = await r.json();
    if (d.status === 200) {
      const oid = d.data.outbound_id;
      const status = d.data.outbound_status;
      if (status !== "label_obtained") {
        setError(
          t("wms_ops.label_print.pallet_wrong_status", { status })
        );
      } else {
        setPalletFlash(t("wms_ops.label_print.pallet_loaded", { oid }));
        await loadBoxes(oid);
        setPalletInput("");
      }
    } else {
      setError(d.message ?? "scan failed");
    }
  };

  useEffect(() => {
    reload();
    palletRef.current?.focus();
  }, []);

  const printAll = (urls: (string | null)[]) => {
    for (const u of urls) {
      if (u) window.open(u, "_blank");
    }
  };
  const complete = async (id: string) => {
    setError("");
    const r = await http_request(
      "POST",
      `/api/wms/outbound/${id}/label-print-complete`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) {
      setFlash(`${id} ${t("wms_ops.label_print.done")}`);
      await reload();
      setOpenId(null);
      setBoxes([]);
    } else {
      setError(d.message ?? "fail");
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 grid gap-4">
      <Card>
        <CardContent className="py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              scanPallet();
            }}
            className="flex gap-2 items-end"
          >
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">
                {t("wms_ops.label_print.scan_pallet_label")}
              </div>
              <Input
                ref={palletRef}
                value={palletInput}
                onChange={(e) => setPalletInput(e.target.value)}
                placeholder={t(
                  "wms_ops.label_print.scan_pallet_placeholder"
                )}
                autoComplete="off"
              />
            </div>
            <Button type="submit">
              {t("wms_ops.label_print.scan_pallet_btn")}
            </Button>
          </form>
          {palletFlash && (
            <p className="text-xs text-emerald-700 mt-2">{palletFlash}</p>
          )}
        </CardContent>
      </Card>
      {list.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            {t("wms_ops.label_print.empty")}
          </CardContent>
        </Card>
      )}
      {list.map((o) => (
        <Card key={o._id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                <span className="font-mono">{o._id}</span> ·{" "}
                {o.carrier_code} → {o.destination_country} · {o.inbound_count}{" "}
                件
              </h2>
              <Button
                variant="outline"
                onClick={() =>
                  openId === o._id ? setOpenId(null) : loadBoxes(o._id)
                }
              >
                {openId === o._id ? "收起" : t("wms_ops.label_print.expand")}
              </Button>
            </div>
          </CardHeader>
          {openId === o._id && (
            <CardContent>
              <div className="grid gap-2 text-sm">
                {boxes.map((b) => (
                  <div
                    key={b._id}
                    className="flex items-center justify-between border rounded p-2"
                  >
                    <div>
                      <div className="font-mono">{b.box_no}</div>
                      <div className="text-xs text-gray-500">
                        {b.tracking_no_carrier ?? "—"}
                      </div>
                    </div>
                    {b.label_pdf_path && (
                      <a
                        href={b.label_pdf_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline text-xs"
                      >
                        {t("wms_ops.label_print.preview_pdf")}
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `/zh-hk/wms/print/invoice/${o._id}`,
                      "_blank"
                    )
                  }
                >
                  {t("wms_ops.label_print.print_invoice")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => printAll(boxes.map((b) => b.label_pdf_path))}
                >
                  {t("wms_ops.label_print.print_all")}
                </Button>
                <Button onClick={() => complete(o._id)}>
                  {t("wms_ops.label_print.complete")}
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
      {flash && <p className="text-sm text-emerald-700">{flash}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

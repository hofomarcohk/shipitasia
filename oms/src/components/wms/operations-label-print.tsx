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
  useEffect(() => {
    reload();
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

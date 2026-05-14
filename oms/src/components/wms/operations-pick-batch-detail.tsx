"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface BatchOutbound {
  _id: string;
  client_id: string;
  client_code: string | null;
  status: string;
  inbound_count: number;
  carrier_code: string;
  destination_country: string;
}

interface BatchDetail {
  _id: string;
  batch_no: string;
  warehouseCode: string;
  status: string;
  outbound_ids: string[];
  note: string | null;
  started_at: string | null;
  picked_at: string | null;
  closed_at: string | null;
  outbounds: BatchOutbound[];
  progress: { total_inbounds: number; picked_inbounds: number };
}

export const OperationsPickBatchDetail = ({
  batchId,
}: {
  batchId: string;
}) => {
  const t = useTranslations();
  const [data, setData] = useState<BatchDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await http_request(
      "GET",
      `/api/wms/pick-batch/${batchId}`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) setData(d.data);
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, [batchId]);

  const action = async (path: string, body?: any) => {
    setBusy(true);
    const r = await http_request("POST", path, body ?? {});
    const d = await r.json();
    setBusy(false);
    if (d.status !== 200) {
      alert(d.message ?? "action failed");
    }
    await load();
  };

  if (!data) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  const pct = data.progress.total_inbounds
    ? Math.round(
        (data.progress.picked_inbounds / data.progress.total_inbounds) * 100
      )
    : 0;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm">{data._id}</span>
            <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100">
              {t(`wms_ops.pick_batch.status.${data.status}` as any)}
            </span>
            <div className="ml-auto flex gap-2">
              {(data.status === "draft" || data.status === "picking") && (
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `/zh-hk/wms/operations/pick-batch/${batchId}/print`,
                      "_blank"
                    )
                  }
                >
                  {t("wms_ops.pick_batch.print_pick_sheet_btn")}
                </Button>
              )}
              {data.status === "draft" && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    action(`/api/wms/pick-batch/${batchId}/start`)
                  }
                >
                  {t("wms_ops.pick_batch.start_btn")}
                </Button>
              )}
              {(data.status === "picking" || data.status === "picked") && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    action(`/api/wms/pick-batch/${batchId}/close`)
                  }
                >
                  {t("wms_ops.pick_batch.close_btn")}
                </Button>
              )}
              {(data.status === "draft" || data.status === "picking") && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    const reason =
                      prompt(t("wms_ops.pick_batch.cancel_reason_prompt")) ??
                      "";
                    if (reason)
                      action(`/api/wms/pick-batch/${batchId}/cancel`, {
                        reason,
                      });
                  }}
                >
                  {t("wms_ops.pick_batch.cancel_btn")}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500">
                {t("wms_ops.pick_batch.col.outbounds_count")}
              </div>
              <div className="font-semibold">{data.outbounds.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">
                {t("wms_ops.pick_batch.progress")}
              </div>
              <div className="font-semibold">
                {data.progress.picked_inbounds} / {data.progress.total_inbounds}{" "}
                ({pct}%)
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">
                {t("wms_ops.pick_batch.started_at")}
              </div>
              <div className="text-xs">
                {data.started_at
                  ? new Date(data.started_at).toLocaleString()
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">
                {t("wms_ops.pick_batch.col.note")}
              </div>
              <div className="text-xs">{data.note ?? "—"}</div>
            </div>
          </div>
          <div className="mt-4 h-2 w-full bg-gray-100 rounded overflow-hidden">
            <div
              className="h-2 bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold">
            {t("wms_ops.pick_batch.outbound_list_title")}
          </h3>
        </CardHeader>
        <CardContent>
          <div className="border rounded">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-xs font-medium">
              <div className="col-span-3">
                {t("wms_ops.pick_batch.col.outbound")}
              </div>
              <div className="col-span-2">
                {t("wms_ops.pick_batch.col.client")}
              </div>
              <div className="col-span-2">
                {t("wms_ops.pick_batch.col.status")}
              </div>
              <div className="col-span-2">
                {t("wms_ops.pick_batch.col.carrier")}
              </div>
              <div className="col-span-1">
                {t("wms_ops.pick_batch.col.dest")}
              </div>
              <div className="col-span-2">
                {t("wms_ops.pick_batch.col.inbounds")}
              </div>
            </div>
            {data.outbounds.map((o) => (
              <div
                key={o._id}
                className="grid grid-cols-12 gap-2 px-3 py-2 border-t items-center text-sm"
              >
                <div className="col-span-3 font-mono text-xs">{o._id}</div>
                <div className="col-span-2 font-mono text-xs">
                  {o.client_code ?? o.client_id}
                </div>
                <div className="col-span-2">
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                    {o.status}
                  </span>
                </div>
                <div className="col-span-2">{o.carrier_code}</div>
                <div className="col-span-1">{o.destination_country}</div>
                <div className="col-span-2">{o.inbound_count}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

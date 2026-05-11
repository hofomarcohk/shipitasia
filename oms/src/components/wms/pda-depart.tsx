"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface ScanResult {
  outbound_id: string;
  box_no: string;
  outbound_departed: boolean;
  progress: { departed: number; total: number };
}

interface OutboundRow {
  _id: string;
  inbound_count: number;
}

export const PdaDepart = () => {
  const t = useTranslations();
  const [boxNo, setBoxNo] = useState("");
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [list, setList] = useState<OutboundRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const r = await http_request("GET", "/api/wms/outbound/departable", {});
    const d = await r.json();
    if (d.status === 200) setList(d.data ?? []);
  };
  useEffect(() => {
    reload();
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    if (!boxNo.trim()) return;
    setError("");
    setFlash("");
    const r = await http_request("POST", "/api/wms/outbound/depart", {
      box_no: boxNo.trim(),
    });
    const d = await r.json();
    if (d.status === 200) {
      setHistory((p) => [d.data, ...p].slice(0, 10));
      setFlash(
        d.data.outbound_departed
          ? `${d.data.outbound_id} ${t("wms_scan.depart.outbound_done")}`
          : t("wms_scan.depart.box_done", {
              departed: d.data.progress.departed,
              total: d.data.progress.total,
            })
      );
      setBoxNo("");
      await reload();
    } else {
      setError(d.message ?? "fail");
    }
    inputRef.current?.focus();
  };

  return (
    <div className="max-w-md mx-auto py-6 px-4 grid gap-3">
      <Card>
        <CardHeader>
          <h2 className="font-semibold">{t("wms_scan.depart.scan_title")}</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t("wms_scan.depart.box_no_label")}</Label>
            <Input
              ref={inputRef}
              value={boxNo}
              onChange={(e) => setBoxNo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="B-0010-01"
              autoFocus
            />
          </div>
          <Button className="w-full" onClick={submit}>
            {t("wms_scan.depart.submit")}
          </Button>
          {flash && (
            <p className="text-sm text-emerald-700 text-center">{flash}</p>
          )}
          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-sm">
            {t("wms_scan.depart.pending_title")}
          </h2>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {list.length === 0 ? (
            <p className="text-gray-500">{t("wms_scan.depart.no_pending")}</p>
          ) : (
            list.map((o) => (
              <div key={o._id} className="font-mono text-xs">
                {o._id} · {o.inbound_count} 件
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm">
              {t("wms_scan.depart.history")}
            </h2>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {history.map((h, i) => (
              <div key={i}>
                {h.outbound_id} · {h.box_no} · {h.progress.departed}/{h.progress.total}
                {h.outbound_departed ? " ✅" : ""}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

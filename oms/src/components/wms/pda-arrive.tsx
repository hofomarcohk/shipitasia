"use client";
// PDA "到貨簽收" — pure scan-loop. Operator scans the carrier label,
// system flips inbound pending → arrived, flash + clear + refocus. No
// data entry: photos / weight / dimensions / anomalies all happen at
// receive time (上架) where the operator has the package opened anyway.
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface ArriveResult {
  matched?: boolean;
  scan_id?: string;
  inbound_id?: string;
}

export const PdaArrive = () => {
  const t = useTranslations();
  const [trackingNo, setTrackingNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [unmatched, setUnmatched] = useState<string | null>(null);
  const [abandonedCount, setAbandonedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refreshBanner = async () => {
    try {
      const r = await http_request("GET", "/api/wms/abandoned-inbounds", {});
      const d = await r.json();
      if (d.status === 200) setAbandonedCount(d.data.length);
    } catch {}
  };

  useEffect(() => {
    refreshBanner();
    inputRef.current?.focus();
  }, []);

  const focusInput = () => {
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submit = async () => {
    const trimmed = trackingNo.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    setUnmatched(null);
    try {
      const fd = new FormData();
      fd.append("tracking_no", trimmed);
      const r = await fetch("/api/wms/scan/arrive", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const d = await r.json();
      if (d.status !== 200) {
        setError(d.message || "Failed");
        return;
      }
      const data: ArriveResult = d.data ?? {};
      if (data.matched === false) {
        setUnmatched(trimmed);
        return;
      }
      setFlash(
        t("wms_scan.submit_success_arrive", { id: data.inbound_id ?? "—" })
      );
      setTrackingNo("");
      refreshBanner();
      setTimeout(() => setFlash(""), 1800);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
      focusInput();
    }
  };

  return (
    <div className="w-full max-w-md mx-auto grid gap-3">
      {abandonedCount > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-sm text-amber-700 flex items-center justify-between">
          <span>
            {t("wms_scan.abandon_banner").replace(
              "{n}",
              String(abandonedCount)
            )}
          </span>
          <a
            href="/zh-hk/wms/operations/abandoned-inbounds"
            className="underline text-xs"
          >
            {t("wms_scan.see_list")}
          </a>
        </div>
      )}

      {flash && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {flash}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {unmatched && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm">
          <div>{t("wms_scan.no_match")}</div>
          <div className="font-mono text-xs text-gray-600 mt-1">{unmatched}</div>
          <a
            href={`/zh-hk/wms/pda/scan/inbound-arrive/unclaimed?tracking=${encodeURIComponent(unmatched)}`}
            className="text-blue-600 underline text-xs mt-2 inline-block"
          >
            {t("wms_scan.register_unclaimed_btn")}
          </a>
        </div>
      )}

      <Card>
        <CardContent className="grid gap-3 py-4">
          <Label>{t("wms_scan.scan_tracking")}</Label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              autoFocus
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
              placeholder="1234-5678-9012"
              autoComplete="off"
              autoCapitalize="characters"
              className="flex-1"
            />
            <Button type="submit" disabled={busy || !trackingNo.trim()}>
              {busy ? t("wms_scan.submitting") : t("wms_scan.lookup")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

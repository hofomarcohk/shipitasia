"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

type Anomaly = { code: string; note: string; photo_paths: string[] };

interface MatchedInbound {
  _id: string;
  status: string;
  shipment_type: string;
  inbound_source: string;
  size_estimate: string;
  contains_liquid: boolean;
  contains_battery: boolean;
  declared_items_count: number;
}

const ANOMALY_CODES = ["damaged", "wet", "packaging", "mismatch"] as const;

export const PdaArrive = () => {
  const t = useTranslations();

  // Step 1 — scan tracking
  const [trackingNo, setTrackingNo] = useState("");
  const [matched, setMatched] = useState<MatchedInbound | null>(null);
  const [unmatched, setUnmatched] = useState(false);
  const [looking, setLooking] = useState(false);

  // Step 2 — capture
  const [barcodeFile, setBarcodeFile] = useState<File | null>(null);
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [weight, setWeight] = useState("");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [anomalies, setAnomalies] = useState<Record<string, Anomaly>>({});
  const [staffNote, setStaffNote] = useState("");

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [lastScanId, setLastScanId] = useState<{ id: string; at: number } | null>(
    null
  );
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);

  // Abandoned banner
  const [abandonedCount, setAbandonedCount] = useState(0);

  const trackingRef = useRef<HTMLInputElement | null>(null);

  // 5-min undo countdown
  useEffect(() => {
    if (!lastScanId) return;
    const tick = () => {
      const left = Math.max(
        0,
        300 - Math.floor((Date.now() - lastScanId.at) / 1000)
      );
      setUndoSecondsLeft(left);
      if (left === 0) setLastScanId(null);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [lastScanId]);

  // Refresh banner on mount + after submit
  const refreshBanner = async () => {
    try {
      const r = await http_request("GET", "/api/wms/abandoned-inbounds", {});
      const d = await r.json();
      if (d.status === 200) setAbandonedCount(d.data.length);
    } catch {}
  };
  useEffect(() => {
    refreshBanner();
    trackingRef.current?.focus();
  }, []);

  const reset = () => {
    setTrackingNo("");
    setMatched(null);
    setUnmatched(false);
    setBarcodeFile(null);
    setPackageFile(null);
    setWeight("");
    setDimL("");
    setDimW("");
    setDimH("");
    setAnomalies({});
    setStaffNote("");
    setError("");
    setTimeout(() => trackingRef.current?.focus(), 50);
  };

  const lookup = async () => {
    if (!trackingNo.trim()) return;
    setLooking(true);
    setMatched(null);
    setUnmatched(false);
    try {
      const r = await http_request(
        "POST",
        "/api/wms/scan/arrive/lookup",
        { tracking_no: trackingNo.trim() }
      );
      const d = await r.json();
      if (d.status === 200) {
        if (d.data.matched) {
          setMatched(d.data.inbound);
        } else {
          setUnmatched(true);
        }
      }
    } finally {
      setLooking(false);
    }
  };

  const submit = async () => {
    setError("");
    if (!barcodeFile) {
      setError(t("wms_scan.photo_barcode"));
      return;
    }
    if (!packageFile) {
      setError(t("wms_scan.photo_package"));
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("tracking_no", trackingNo.trim());
      if (weight) fd.append("weight", weight);
      if (dimL && dimW && dimH) {
        fd.append(
          "dimension",
          JSON.stringify({
            length: parseInt(dimL, 10),
            width: parseInt(dimW, 10),
            height: parseInt(dimH, 10),
          })
        );
      }
      const anomaliesArr = Object.values(anomalies).filter((a) => a.note);
      if (anomaliesArr.length > 0) {
        fd.append(
          "anomalies",
          JSON.stringify(
            anomaliesArr.map((a) => ({
              ...a,
              // photo_paths gets backfilled server-side from photo_anomaly
              photo_paths: a.photo_paths.length > 0 ? a.photo_paths : ["pending"],
            }))
          )
        );
      }
      if (staffNote) fd.append("staff_note", staffNote);
      fd.append("photo_barcode", barcodeFile);
      fd.append("photo_package", packageFile);

      const r = await fetch("/api/wms/scan/arrive", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const d = await r.json();
      if (r.ok && d.status === 200 && d.data?.scan_id) {
        setFlash(
          t("wms_scan.submit_success_arrive").replace("{id}", d.data.inbound_id)
        );
        setLastScanId({ id: d.data.scan_id, at: Date.now() });
        refreshBanner();
        reset();
      } else {
        setError(d.message || "Failed");
      }
    } catch (err) {
      console.error(err);
      setError("Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const undo = async () => {
    if (!lastScanId) return;
    setSubmitting(true);
    try {
      const r = await http_request(
        "POST",
        "/api/wms/scan/arrive/cancel",
        { scan_id: lastScanId.id }
      );
      const d = await r.json();
      if (r.ok && d.status === 200) {
        setLastScanId(null);
        setFlash("撤銷成功");
      } else {
        setError(d.message || "Failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAnomaly = (code: string) => {
    setAnomalies((prev) => {
      const copy = { ...prev };
      if (copy[code]) {
        delete copy[code];
      } else {
        copy[code] = { code, note: "", photo_paths: [] };
      }
      return copy;
    });
  };

  return (
    <div className="max-w-md mx-auto py-4 px-3 grid gap-3">
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
          {lastScanId && undoSecondsLeft > 0 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                {t("wms_scan.undo_window_label").replace(
                  "{sec}",
                  String(undoSecondsLeft)
                )}
              </span>
              <Button size="sm" variant="outline" onClick={undo}>
                {t("wms_scan.undo_btn")}
              </Button>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardContent className="grid gap-3 py-4">
          <Label>{t("wms_scan.scan_tracking")}</Label>
          <div className="flex gap-2">
            <Input
              ref={trackingRef}
              autoFocus
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") lookup();
              }}
              placeholder="1234-5678-9012"
            />
            <Button onClick={lookup} disabled={looking || !trackingNo.trim()}>
              {looking ? t("wms_scan.looking_up") : t("wms_scan.lookup")}
            </Button>
          </div>

          {matched && (
            <div className="rounded-md border border-green-200 bg-green-50 p-2 text-sm">
              <div className="font-mono font-semibold">{matched._id}</div>
              <div className="text-xs text-gray-600 mt-1">
                {t("wms_scan.match_found")} · {matched.shipment_type} ·{" "}
                {matched.declared_items_count} items
              </div>
            </div>
          )}

          {unmatched && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm">
              <div>{t("wms_scan.no_match")}</div>
              <a
                href={`/zh-hk/wms/pda/scan/inbound-arrive/unclaimed?tracking=${encodeURIComponent(trackingNo)}`}
                className="text-blue-600 underline text-xs mt-1 inline-block"
              >
                {t("wms_scan.register_unclaimed_btn")}
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {matched && (
        <Card>
          <CardContent className="grid gap-3 py-4">
            <div className="grid gap-1">
              <Label>{t("wms_scan.photo_barcode")}</Label>
              <Input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setBarcodeFile(e.target.files?.[0] ?? null)}
              />
              {barcodeFile && (
                <span className="text-xs text-gray-500">
                  ✓ {barcodeFile.name} ({Math.round(barcodeFile.size / 1024)}KB)
                </span>
              )}
            </div>
            <div className="grid gap-1">
              <Label>{t("wms_scan.photo_package")}</Label>
              <Input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setPackageFile(e.target.files?.[0] ?? null)}
              />
              {packageFile && (
                <span className="text-xs text-gray-500">
                  ✓ {packageFile.name} ({Math.round(packageFile.size / 1024)}KB)
                </span>
              )}
            </div>

            <div className="grid gap-1">
              <Label>{t("wms_scan.weight_kg")}</Label>
              <Input
                type="number"
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputMode="decimal"
              />
            </div>

            <div className="grid gap-1">
              <Label>{t("wms_scan.dimension")}</Label>
              <div className="flex gap-1">
                <Input
                  placeholder="L"
                  type="number"
                  value={dimL}
                  onChange={(e) => setDimL(e.target.value)}
                />
                <Input
                  placeholder="W"
                  type="number"
                  value={dimW}
                  onChange={(e) => setDimW(e.target.value)}
                />
                <Input
                  placeholder="H"
                  type="number"
                  value={dimH}
                  onChange={(e) => setDimH(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2 border-t pt-3">
              <Label>{t("wms_scan.anomaly_section")}</Label>
              {ANOMALY_CODES.map((code) => (
                <div key={code}>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`a-${code}`}
                      checked={!!anomalies[code]}
                      onCheckedChange={() => toggleAnomaly(code)}
                    />
                    <Label htmlFor={`a-${code}`} className="font-normal">
                      {t(`wms_scan.anomaly_${code}` as any)}
                    </Label>
                  </div>
                  {anomalies[code] && (
                    <Input
                      className="mt-1"
                      placeholder={t("wms_scan.anomaly_note")}
                      value={anomalies[code].note}
                      onChange={(e) =>
                        setAnomalies((p) => ({
                          ...p,
                          [code]: { ...p[code], note: e.target.value },
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-1">
              <Label>{t("wms_scan.staff_note")}</Label>
              <Textarea
                rows={2}
                maxLength={200}
                placeholder={t("wms_scan.staff_note_placeholder")}
                value={staffNote}
                onChange={(e) => setStaffNote(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm" role="alert">
                {error}
              </p>
            )}

            <Button onClick={submit} disabled={submitting} className="w-full">
              {submitting
                ? t("wms_scan.submitting")
                : t("wms_scan.submit_arrive")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

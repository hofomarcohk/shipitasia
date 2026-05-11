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

interface Matched {
  _id: string;
  status: string;
  shipment_type: string;
  tracking_no: string;
  actualWeight: number | null;
  actualDimension: any | null;
}

interface LocationOption {
  warehouseCode: string;
  locationCode: string;
  zone: string;
}

const ANOMALY_CODES = ["damaged", "wet", "packaging", "mismatch"] as const;

export const PdaReceive = () => {
  const t = useTranslations();
  const [locationCode, setLocationCode] = useState("");
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [matched, setMatched] = useState<Matched | null>(null);
  const [looking, setLooking] = useState(false);

  // Hydrate the location pull-down on mount so PDA users don't have to
  // type. Falls back gracefully to a free-text input if the fetch fails
  // or the warehouse has no seeded locations yet.
  useEffect(() => {
    (async () => {
      try {
        const r = await http_request("GET", "/api/wms/locations", {});
        const d = await r.json();
        if (d.status === 200) setLocationOptions(d.data ?? []);
      } catch {
        // network fail — leave list empty, fall back to text input
      }
    })();
  }, []);

  const [barcodeFile, setBarcodeFile] = useState<File | null>(null);
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [weight, setWeight] = useState("");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const [anomalies, setAnomalies] = useState<Record<string, Anomaly>>({});
  const [staffNote, setStaffNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [abandonedCount, setAbandonedCount] = useState(0);

  const locationRef = useRef<HTMLInputElement | null>(null);

  const refreshBanner = async () => {
    try {
      const r = await http_request("GET", "/api/wms/abandoned-inbounds", {});
      const d = await r.json();
      if (d.status === 200) setAbandonedCount(d.data.length);
    } catch {}
  };
  useEffect(() => {
    refreshBanner();
    locationRef.current?.focus();
  }, []);

  const lookup = async () => {
    if (!identifier.trim()) return;
    setLooking(true);
    setMatched(null);
    try {
      const r = await http_request(
        "POST",
        "/api/wms/scan/receive/lookup",
        { identifier: identifier.trim() }
      );
      const d = await r.json();
      if (d.status === 200) {
        if (d.data.matched) {
          setMatched(d.data.inbound);
          if (d.data.inbound.actualWeight)
            setWeight(String(d.data.inbound.actualWeight));
          if (d.data.inbound.actualDimension) {
            setDimL(String(d.data.inbound.actualDimension.length));
            setDimW(String(d.data.inbound.actualDimension.width));
            setDimH(String(d.data.inbound.actualDimension.height));
          }
        } else {
          setError(t("wms_scan.no_match"));
        }
      }
    } finally {
      setLooking(false);
    }
  };

  const reset = () => {
    setLocationCode("");
    setIdentifier("");
    setMatched(null);
    setBarcodeFile(null);
    setPackageFile(null);
    setWeight("");
    setDimL("");
    setDimW("");
    setDimH("");
    setAnomalies({});
    setStaffNote("");
    setError("");
    setTimeout(() => locationRef.current?.focus(), 50);
  };

  const submit = async () => {
    setError("");
    if (!matched) {
      setError(t("wms_scan.no_match"));
      return;
    }
    const directMode = matched.status === "pending";
    if (directMode) {
      if (!barcodeFile) {
        setError(t("wms_scan.photo_barcode"));
        return;
      }
      if (!packageFile) {
        setError(t("wms_scan.photo_package"));
        return;
      }
      if (!weight || !dimL || !dimW || !dimH) {
        setError("weight + dimension required for direct receive");
        return;
      }
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("inbound_id", matched._id);
      fd.append("locationCode", locationCode);
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
              photo_paths:
                a.photo_paths.length > 0 ? a.photo_paths : ["pending"],
            }))
          )
        );
      }
      if (staffNote) fd.append("staff_note", staffNote);
      if (barcodeFile) fd.append("photo_barcode", barcodeFile);
      if (packageFile) fd.append("photo_package", packageFile);

      const r = await fetch("/api/wms/scan/receive", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const d = await r.json();
      if (r.ok && d.status === 200 && d.data?.scan_id) {
        setFlash(
          t("wms_scan.submit_success_receive", {
            id: d.data.inbound_id,
            loc: locationCode,
            bal: String(d.data.balance_after),
          })
        );
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

  const toggleAnomaly = (code: string) => {
    setAnomalies((prev) => {
      const c = { ...prev };
      if (c[code]) delete c[code];
      else c[code] = { code, note: "", photo_paths: [] };
      return c;
    });
  };

  const directMode = matched?.status === "pending";

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

      <Card>
        <CardContent className="grid gap-3 py-4">
          <Label>{t("wms_scan.scan_location")}</Label>
          {locationOptions.length > 0 ? (
            <select
              className="w-full border rounded h-10 px-2 text-base"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
            >
              <option value="">—</option>
              {locationOptions.map((l) => (
                <option key={l.locationCode} value={l.locationCode}>
                  {l.locationCode} ({l.zone})
                </option>
              ))}
            </select>
          ) : (
            <Input
              ref={locationRef}
              autoFocus
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
              placeholder="A001"
            />
          )}
          <Label className="mt-2">{t("wms_scan.scan_inbound_id")}</Label>
          <div className="flex gap-2">
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") lookup();
              }}
              placeholder="I-... or tracking #"
            />
            <Button
              onClick={lookup}
              disabled={looking || !identifier.trim() || !locationCode.trim()}
            >
              {looking ? t("wms_scan.looking_up") : t("wms_scan.lookup")}
            </Button>
          </div>
          {matched && (
            <div className="rounded-md border border-green-200 bg-green-50 p-2 text-sm">
              <div className="font-mono font-semibold">{matched._id}</div>
              <div className="text-xs text-gray-600">
                status: {matched.status} · {matched.shipment_type}
                {directMode && " · 直走模式（photo+weight+dim required）"}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {matched && (
        <Card>
          <CardContent className="grid gap-3 py-4">
            {directMode && (
              <>
                <div className="grid gap-1">
                  <Label>{t("wms_scan.photo_barcode")}</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setBarcodeFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label>{t("wms_scan.photo_package")}</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setPackageFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </>
            )}

            <div className="grid gap-1">
              <Label>{t("wms_scan.weight_kg")}</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder={directMode ? "required" : "optional"}
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
                      id={`r-a-${code}`}
                      checked={!!anomalies[code]}
                      onCheckedChange={() => toggleAnomaly(code)}
                    />
                    <Label htmlFor={`r-a-${code}`} className="font-normal">
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
                : t("wms_scan.submit_receive")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

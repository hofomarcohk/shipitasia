"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Barcode from "react-barcode";

/**
 * WMS box-label print page. 10cm × 15cm portrait (thermal label).
 * Auto-triggers the browser print dialog on load. URL params:
 *   box_no    — e.g. BOX-SIA0005-001 (required)
 *   client    — display name on the label
 *   variant   — "single" marks the box visually as direct shipment
 */
export default function Page() {
  const sp = useSearchParams();
  const boxNo = sp.get("box_no") ?? "";
  const client = sp.get("client") ?? "";
  const variant = sp.get("variant") ?? "";
  const printedRef = useRef(false);
  // Mount-gated: avoids server/client hydration mismatch from Date formatting
  // and guarantees the auto-print only fires after the first client paint.
  const [mounted, setMounted] = useState(false);
  const [stamp, setStamp] = useState("");

  useEffect(() => {
    setMounted(true);
    setStamp(
      new Date().toLocaleString("zh-HK", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    );
  }, []);

  useEffect(() => {
    if (!mounted || !boxNo || printedRef.current) return;
    printedRef.current = true;
    // Wait for the Barcode SVG to mount, then fire print after a paint.
    const t = window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    }, 800);
    return () => window.clearTimeout(t);
  }, [mounted, boxNo]);

  if (!boxNo) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui", color: "#7c2d12" }}>
        Missing <code>?box_no=</code> parameter.
      </div>
    );
  }

  return (
    <>
      <style>{`
        @page { size: 100mm 150mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        /* Force the barcode SVG to shrink-to-fit its container so longer
           box_no strings never overflow the label width. */
        .label-sheet svg { max-width: 100%; height: auto; display: block; }
        @media print {
          .label-sheet { box-shadow: none !important; }
        }
      `}</style>
      <div
        className="label-sheet"
        style={{
          width: "100mm",
          height: "150mm",
          padding: "6mm",
          margin: "0 auto",
          fontFamily:
            'system-ui, -apple-system, "PingFang HK", "Microsoft JhengHei", sans-serif',
          color: "#0c0a09",
          background: "#fff",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            border: "2px solid #0c0a09",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "4mm 3mm",
          }}
        >
          {/* header */}
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#78716c",
              textAlign: "center",
            }}
          >
            ShipItAsia · Pack Box
          </div>

          {/* single-direct banner */}
          {variant === "single" && (
            <div style={{ textAlign: "center", marginTop: "3mm" }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 13,
                  fontWeight: 700,
                  background: "#fef3c7",
                  color: "#92400e",
                  border: "1.5px solid #fde68a",
                  padding: "2px 10px",
                  borderRadius: 4,
                  letterSpacing: "0.04em",
                }}
              >
                直發 · SINGLE DIRECT
              </span>
            </div>
          )}

          {/* barcode block (real Code128). Wrapped in a width-constrained
              container; the SVG is scaled down via CSS to never overflow the
              label even for longer box numbers. */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              marginTop: "4mm",
              width: "100%",
            }}
          >
            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  transform: "scale(1)",
                  transformOrigin: "center",
                  maxWidth: "100%",
                }}
              >
                <Barcode
                  value={boxNo}
                  format="CODE128"
                  width={1.4}
                  height={90}
                  displayValue={false}
                  margin={0}
                  background="#ffffff"
                  lineColor="#000000"
                />
              </div>
            </div>
            <div
              style={{
                fontFamily:
                  '"SF Mono", "JetBrains Mono", ui-monospace, Menlo, monospace',
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: "0.06em",
                marginTop: "4mm",
              }}
            >
              {boxNo}
            </div>
          </div>

          {/* client */}
          {client && (
            <div
              style={{
                textAlign: "center",
                fontSize: 14,
                fontWeight: 600,
                color: "#0c0a09",
                paddingTop: "3mm",
                borderTop: "1px dashed #d6d3d1",
              }}
            >
              {client}
            </div>
          )}

          {/* footer timestamp — populated post-mount to avoid SSR/CSR drift */}
          <div
            suppressHydrationWarning
            style={{
              textAlign: "center",
              fontFamily:
                '"SF Mono", "JetBrains Mono", ui-monospace, Menlo, monospace',
              fontSize: 9,
              color: "#a8a29e",
              marginTop: "2mm",
              minHeight: "1em",
            }}
          >
            {stamp}
          </div>
        </div>
      </div>
    </>
  );
}

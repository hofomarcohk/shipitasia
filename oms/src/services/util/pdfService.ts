// Phase 7 — mock label generator. Produces an A6 PDF with a [MOCK]
// watermark so warehouse staff can visually distinguish demo labels from
// real ones at production cut-over.

import fs from "fs/promises";
import path from "path";
import PDFDocument from "pdfkit";

const LABEL_ROOT = process.env.LABEL_STORAGE_DIR
  ? process.env.LABEL_STORAGE_DIR
  : path.join(process.cwd(), "public", "uploads", "labels");

const LABEL_PUBLIC_PREFIX = "/uploads/labels";

export interface MockLabelInput {
  outbound_id: string;
  carrier_code: string;
  tracking_no: string;
  destination_country: string;
  weight_kg: number;
  receiver_name: string;
  receiver_address: string;
}

export async function generateMockLabel(
  input: MockLabelInput
): Promise<string> {
  const dateStr = formatYYYYMMDD(new Date());
  const dir = path.join(LABEL_ROOT, dateStr);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${input.outbound_id}_${input.carrier_code}.pdf`;
  const fullPath = path.join(dir, filename);

  // A6 in points: 298 x 420
  const doc = new PDFDocument({ size: [298, 420], margin: 16 });
  const chunks: Buffer[] = [];
  doc.on("data", (b: Buffer) => chunks.push(b));
  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", (e: unknown) => reject(e));
  });

  // ── Header ──────────────────────────────────────────────
  doc
    .fontSize(10)
    .fillColor("#222")
    .text(`Carrier: ${input.carrier_code.toUpperCase()}`, { continued: false })
    .moveDown(0.2)
    .text(`Outbound: ${input.outbound_id}`)
    .moveDown(0.2)
    .fontSize(14)
    .text(`TRACKING: ${input.tracking_no}`, { underline: true })
    .moveDown(0.5);

  // ── Receiver ────────────────────────────────────────────
  doc
    .fontSize(11)
    .text(`To: ${input.receiver_name}`)
    .moveDown(0.2)
    .text(input.receiver_address, { width: 266 })
    .moveDown(0.4)
    .fontSize(10)
    .text(`Country: ${input.destination_country}`)
    .moveDown(0.2)
    .text(`Weight: ${input.weight_kg.toFixed(2)} kg`);

  // ── Watermark ───────────────────────────────────────────
  doc.save();
  doc.rotate(-30, { origin: [149, 280] });
  doc
    .fontSize(54)
    .fillColor("#cccccc")
    .opacity(0.45)
    .text("[MOCK]", 30, 240, { width: 240, align: "center" });
  doc.opacity(1);
  doc.restore();

  // ── Footer ──────────────────────────────────────────────
  doc
    .fillColor("#666")
    .fontSize(8)
    .text(
      `Generated ${new Date().toISOString()} · ShipItAsia v1 demo · not for production use`,
      16,
      396,
      { width: 266, align: "center" }
    );

  doc.end();
  await done;
  const buf = Buffer.concat(chunks);
  await fs.writeFile(fullPath, buf);

  // Return the URL the OMS/WMS UI can fetch.
  return `${LABEL_PUBLIC_PREFIX}/${dateStr}/${filename}`;
}

function formatYYYYMMDD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

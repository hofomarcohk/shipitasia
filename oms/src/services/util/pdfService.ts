// Phase 7 — mock label generator.
// v2 (2026-05-11): Switched from runtime PDFKit drawing to a static copy of
// `public/mock-assets/mock-label.pdf`. PDFKit's bundled .afm font files don't
// survive Next 16 / Turbopack server bundling (ENOENT on Helvetica.afm), and
// label content fidelity is not what the v1 flow tests — only that a real PDF
// is produced and reachable via the returned URL. Production cutover replaces
// this whole module with the real carrier API response.

import fs from "fs/promises";
import path from "path";

const LABEL_ROOT = process.env.LABEL_STORAGE_DIR
  ? process.env.LABEL_STORAGE_DIR
  : path.join(process.cwd(), "public", "uploads", "labels");

const LABEL_PUBLIC_PREFIX = "/uploads/labels";

const MOCK_SOURCE_PDF = path.join(
  process.cwd(),
  "public",
  "mock-assets",
  "mock-label.pdf"
);

export interface MockLabelInput {
  outbound_id: string;
  carrier_code: string;
  tracking_no: string;
  destination_country: string;
  weight_kg: number;
  receiver_name: string;
  receiver_address: string;
  box_id?: string;
  box_no?: string;
  dimensions?: { length: number; width: number; height: number };
  sender_name?: string;
  sender_address?: string;
}

export async function generateMockLabel(
  input: MockLabelInput
): Promise<string> {
  const dateStr = formatYYYYMMDD(new Date());
  const dir = path.join(LABEL_ROOT, dateStr);
  await fs.mkdir(dir, { recursive: true });
  const suffix = input.box_no ? `_${input.box_no}` : "";
  const filename = `${input.outbound_id}${suffix}_${input.carrier_code}.pdf`;
  const fullPath = path.join(dir, filename);

  await fs.copyFile(MOCK_SOURCE_PDF, fullPath);

  return `${LABEL_PUBLIC_PREFIX}/${dateStr}/${filename}`;
}

function formatYYYYMMDD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

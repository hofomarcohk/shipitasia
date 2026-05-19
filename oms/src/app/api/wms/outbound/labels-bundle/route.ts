// P20 — merged label PDF endpoint. Takes an outbound_id (single) or
// outbound_ids[] (session) and returns one PDF concatenating every per-
// box label so the warehouse can print everything from one click instead
// of opening N tabs.
//
// Source PDFs live on the local filesystem (mock adapter writes them
// under public/uploads/labels). Real carrier adapters write the same
// label_pdf_path field, so this code path keeps working when production
// labels swap in.

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../_helpers/route-util";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { ApiError } from "@/app/api/api-error";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import fs from "fs/promises";
import path from "path";

async function loadPdfBytes(label_pdf_path: string): Promise<Uint8Array | null> {
  // label_pdf_path may be either an absolute URL (production carriers)
  // or a path under public/ (mock adapter). The latter is the only one
  // we can read directly here; the former we surface as null so the
  // caller knows to fall back to per-link printing.
  if (/^https?:\/\//i.test(label_pdf_path)) {
    try {
      const res = await fetch(label_pdf_path);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  const rel = label_pdf_path.startsWith("/")
    ? label_pdf_path.slice(1)
    : label_pdf_path;
  const full = path.join(process.cwd(), "public", rel);
  try {
    return new Uint8Array(await fs.readFile(full));
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireWmsStaff(request);
    const sp = new URL(request.url).searchParams;
    const single = sp.get("outbound_id");
    const multi = sp.get("outbound_ids");
    const outboundIds = multi
      ? multi.split(",").map((s) => s.trim()).filter(Boolean)
      : single
      ? [single]
      : [];
    if (outboundIds.length === 0) {
      throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: "(none)" });
    }
    const db = await connectToDatabase();
    const boxes = await db
      .collection(collections.OUTBOUND_BOX)
      .find({
        outbound_id: { $in: outboundIds },
        label_pdf_path: { $type: "string", $ne: null as any },
      })
      .sort({ outbound_id: 1, box_no: 1 })
      .toArray();
    if (boxes.length === 0) {
      throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", {
        status: "no_labels",
      });
    }

    const out = await PDFDocument.create();
    let merged = 0;
    for (const b of boxes as any[]) {
      const bytes = await loadPdfBytes(String(b.label_pdf_path));
      if (!bytes) continue;
      try {
        const src = await PDFDocument.load(bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const p of pages) out.addPage(p);
        merged++;
      } catch {
        // Skip a box whose PDF is unreadable rather than failing the whole bundle.
      }
    }
    if (merged === 0) {
      throw new ApiError("OUTBOUND_NOT_AVAILABLE_FOR_LABEL", {
        status: "no_readable_labels",
      });
    }
    const buf = await out.save();
    const filenameHint =
      outboundIds.length === 1
        ? `labels_${outboundIds[0]}.pdf`
        : `labels_${outboundIds.length}_outbounds_${new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, "")}.pdf`;
    return {
      status: 200,
      message: "Success",
      isFile: true,
      data: Buffer.from(buf),
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filenameHint}"`,
        "Cache-Control": "no-store",
      },
    } as any;
  });
}

// P17 — depart-page dual-scan: box label + 3PL label matched pair.
//
// Per the audit gap report, the legacy depart flow only scanned the
// box_no; the handoff #depart page requires a paired scan (box label
// THEN 3PL label) before marking the box departed. This wrapper:
//
//   1. Loads the box by box_no, verifies it's in a departable state.
//   2. Compares the scanned 3PL label against box.tracking_no — the
//      carrier-assigned tracking number stamped on the box during
//      label fetch. Mismatch throws DEPART_LABEL_MISMATCH so the PDA
//      can prompt the operator to confirm they're holding the right
//      label for the right box.
//   3. Delegates the actual state transition to departBox() so the
//      cascade (box → outbound → linked inbounds → audit + scans)
//      remains the single source of truth.
//   4. Stamps the dual-scan denormalisation on the box so the depart
//      page can render the matched-pair tick + the print audit can
//      prove which 3PL number landed against which box.
//
// Comparison is normalisation-tolerant: trim + uppercase both sides.
// Mock-phase trackings are alphanumeric; production carrier labels
// often have whitespace from scanner artifacts.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { departBox } from "@/services/outbound/wmsFlow";

interface StaffContext {
  staff_id: string;
  warehouseCode: string;
  ip_address?: string;
  user_agent?: string;
}

function normalize(s: string): string {
  return s.trim().toUpperCase();
}

export interface DoubleScanDepartResult {
  outbound_id: string;
  box_no: string;
  outbound_departed: boolean;
  progress: { departed: number; total: number };
  matched_tracking_no: string;
  matched_at: Date;
}

export async function performDoubleScanDepart(
  ctx: StaffContext,
  input: { box_no: string; third_party_label: string }
): Promise<DoubleScanDepartResult> {
  if (!input?.box_no || !input?.third_party_label) {
    throw new ApiError("BOX_NOT_FOUND", { boxNo: input?.box_no ?? "" });
  }
  const db = await connectToDatabase();
  const box = await db
    .collection(collections.OUTBOUND_BOX)
    .findOne({ box_no: input.box_no });
  if (!box) {
    throw new ApiError("BOX_NOT_FOUND", { boxNo: input.box_no });
  }
  if (!box.tracking_no) {
    throw new ApiError("DEPART_LABEL_MISSING", { boxNo: input.box_no });
  }
  if (normalize(input.third_party_label) !== normalize(box.tracking_no)) {
    throw new ApiError("DEPART_LABEL_MISMATCH", {
      boxNo: input.box_no,
      scanned: input.third_party_label,
      expected: box.tracking_no,
    });
  }

  // Delegate state transition to the existing flow so all downstream
  // cascades (outbound status, linked inbounds, scans, audit, etc.)
  // stay in one place. departBox throws if box is no longer in a
  // departable status.
  const departed = await departBox(ctx, input.box_no);

  const now = new Date();
  await db.collection(collections.OUTBOUND_BOX).updateOne(
    { _id: box._id },
    {
      $set: {
        dual_scan_label: box.tracking_no,
        dual_scan_at: now,
        dual_scan_by: ctx.staff_id,
        updatedAt: now,
      },
    }
  );

  return {
    outbound_id: departed.outbound_id,
    box_no: departed.box_no,
    outbound_departed: departed.outbound_departed,
    progress: departed.progress,
    matched_tracking_no: box.tracking_no,
    matched_at: now,
  };
}

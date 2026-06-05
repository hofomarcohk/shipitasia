// P17 — depart-page dual-scan: box label + 3PL label matched pair.
//
// W5 — rewritten matching logic:
//   Same client's tracking labels can be freely swapped between boxes.
//   Only cross-merchant is rejected. If the scanned 3PL label belongs
//   to ANY box of the same client → accept + bind. If it belongs to
//   a different client → reject. If not found in any box → accept as
//   new binding (e.g. manual label replacement).

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

  // Find which client this box belongs to
  const outbound = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: box.outbound_id as any });
  if (!outbound) {
    throw new ApiError("OUTBOUND_NOT_FOUND", { orderId: box.outbound_id });
  }
  const boxClientId = String(outbound.client_id);

  // W5: cross-merchant check — disabled in mock env, enabled in prod.
  const isMock = process.env.PHASE8_USE_MOCK_CARRIER === "true";
  if (!isMock) {
    const scannedNorm = normalize(input.third_party_label);
    const existingBox = await db
      .collection(collections.OUTBOUND_BOX)
      .findOne({
        $or: [
          { tracking_no: { $regex: `^${escapeRegex(scannedNorm)}$`, $options: "i" } },
          { tracking_no_carrier: { $regex: `^${escapeRegex(scannedNorm)}$`, $options: "i" } },
        ],
      });

    if (existingBox && existingBox.outbound_id !== box.outbound_id) {
      const otherOutbound = await db
        .collection(collections.OUTBOUND)
        .findOne({ _id: existingBox.outbound_id as any });
      if (otherOutbound && String(otherOutbound.client_id) !== boxClientId) {
        throw new ApiError("DEPART_LABEL_MISMATCH", {
          boxNo: input.box_no,
          scanned: input.third_party_label,
          expected: `此運單屬於其他客戶，唔可以 cross-merchant 配對`,
        });
      }
    }
  }

  // Delegate state transition to the existing flow
  const departed = await departBox(ctx, input.box_no);

  const now = new Date();
  const bindTracking = input.third_party_label;
  await db.collection(collections.OUTBOUND_BOX).updateOne(
    { _id: box._id },
    {
      $set: {
        tracking_no: bindTracking,
        tracking_no_carrier: bindTracking,
        dual_scan_label: input.third_party_label,
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
    matched_tracking_no: bindTracking,
    matched_at: now,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

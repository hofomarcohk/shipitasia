import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { PackBoxV1 } from "@/types/PackBoxV1";
import { writeWeighPalletizeAudit } from "./audit";
import {
  buildSameClientHint,
  findSealedBoxByBoxNo,
  getOutboundById,
  SameClientHintEntry,
} from "./getters";
import {
  expectedWeightForInboundIds,
  WEIGHT_TOLERANCE_KG,
} from "./weight";

const PACK_BOXES = collections.PACK_BOX_V1;
const OUTBOUNDS = collections.OUTBOUND;
const SESSION_LOCKS = collections.PACK_SESSION_LOCK;

// ── Helpers ──────────────────────────────────────────────────

async function listSealedBoxesForOutbound(
  outbound_id: string
): Promise<PackBoxV1[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(PACK_BOXES)
    .find({ status: "sealed", "items.outbound_id": outbound_id })
    .toArray();
  return docs as unknown as PackBoxV1[];
}

async function advanceOutboundAfterWeigh(
  staff: string,
  outbound_id: string
): Promise<{ from: string; to: string } | null> {
  const db = await connectToDatabase();
  const outbound = await getOutboundById(outbound_id);
  if (!outbound) return null;

  const boxes = await listSealedBoxesForOutbound(outbound_id);
  if (boxes.length === 0) return null;

  const now = new Date();
  const allWeighed = boxes.every((b) => !!b.weighed_at);

  // packed → weighing (on first save) — keep the move idempotent.
  if (outbound.status === "packed") {
    await db.collection(OUTBOUNDS).updateOne(
      { _id: outbound_id as any, status: "packed" },
      {
        $set: { status: "weighing", updatedAt: now, updatedBy: staff },
      }
    );
    await writeWeighPalletizeAudit(staff, "weigh.advance_status", {
      outbound_id,
      from: "packed",
      to: "weighing",
    });
    if (allWeighed) {
      await db.collection(OUTBOUNDS).updateOne(
        { _id: outbound_id as any, status: "weighing" },
        {
          $set: {
            status: "weight_verified",
            updatedAt: new Date(),
            updatedBy: staff,
          },
        }
      );
      await writeWeighPalletizeAudit(staff, "weigh.advance_status", {
        outbound_id,
        from: "weighing",
        to: "weight_verified",
      });
      return { from: "packed", to: "weight_verified" };
    }
    return { from: "packed", to: "weighing" };
  }

  if (outbound.status === "weighing" && allWeighed) {
    await db.collection(OUTBOUNDS).updateOne(
      { _id: outbound_id as any, status: "weighing" },
      {
        $set: {
          status: "weight_verified",
          updatedAt: now,
          updatedBy: staff,
        },
      }
    );
    await writeWeighPalletizeAudit(staff, "weigh.advance_status", {
      outbound_id,
      from: "weighing",
      to: "weight_verified",
    });
    return { from: "weighing", to: "weight_verified" };
  }

  return null;
}

// ── Save box dimensions + weight ────────────────────────────

export async function saveBox(
  staff: string,
  warehouseCode: string,
  args: {
    box_no: string;
    length: number;
    width: number;
    height: number;
    weight: number;
    /** When the diff vs expected exceeds tolerance, the first save throws
     *  WEIGHT_DIFF_OVER_TOLERANCE. Re-call with force=true to override
     *  after the staff has confirmed in a dialog. */
    force?: boolean;
  }
): Promise<{
  box_no: string;
  outbound_id: string | null;
  outbound_status: string | null;
  weight_check: {
    expected_weight_kg: number;
    sum_actual_weight_kg: number;
    diff_kg: number;
    over_tolerance: boolean;
    forced: boolean;
  };
}> {
  const db = await connectToDatabase();
  const now = new Date();

  const box = await findSealedBoxByBoxNo(args.box_no);
  if (!box) throw new ApiError("PACK_BOX_NOT_FOUND", { boxNo: args.box_no });
  if (box.status !== "sealed") {
    throw new ApiError("PACK_BOX_NOT_SEALED", { boxNo: args.box_no });
  }

  // ── Weight verification gate ──────────────────────────────
  const inboundIds = Array.from(
    new Set((box.items || []).map((i) => String(i.inbound_id)))
  );
  const { sum_actual, expected } = await expectedWeightForInboundIds(inboundIds);
  const actual = Number(args.weight) || 0;
  const diff = Math.round(Math.abs(actual - expected) * 1000) / 1000;
  const overTolerance = diff > WEIGHT_TOLERANCE_KG;
  if (overTolerance && !args.force) {
    throw new ApiError("WEIGHT_DIFF_OVER_TOLERANCE", {
      actual: actual.toFixed(2),
      expected: expected.toFixed(2),
      diff: diff.toFixed(2),
      tol: WEIGHT_TOLERANCE_KG.toFixed(2),
    });
  }

  await db.collection(PACK_BOXES).updateOne(
    { _id: (box as any)._id },
    {
      $set: {
        length: Number(args.length) || 0,
        width: Number(args.width) || 0,
        height: Number(args.height) || 0,
        weight: Number(args.weight) || 0,
        weighed_at: now,
        weighed_by: staff,
        updatedAt: now,
      },
    }
  );

  // Use the first item's outbound_id as the representative outbound — pack-v1
  // boxes are single-client and almost always single-outbound; if multiple,
  // we still want to advance each.
  const affectedOutbounds = Array.from(
    new Set((box.items || []).map((i) => String(i.outbound_id)))
  );

  let primaryOutboundId: string | null = null;
  let primaryStatus: string | null = null;

  for (const oid of affectedOutbounds) {
    const adv = await advanceOutboundAfterWeigh(staff, oid);
    if (!primaryOutboundId) {
      primaryOutboundId = oid;
      const refreshed = await getOutboundById(oid);
      primaryStatus = refreshed?.status || adv?.to || null;
    }
  }

  await writeWeighPalletizeAudit(staff, "weigh.save_box", {
    box_no: args.box_no,
    length: args.length,
    width: args.width,
    height: args.height,
    weight: args.weight,
    expected_weight_kg: expected,
    sum_actual_weight_kg: sum_actual,
    diff_kg: diff,
    over_tolerance: overTolerance,
    forced: !!(overTolerance && args.force),
    warehouseCode,
    affected_outbounds: affectedOutbounds,
  });

  return {
    box_no: args.box_no,
    outbound_id: primaryOutboundId,
    outbound_status: primaryStatus,
    weight_check: {
      expected_weight_kg: expected,
      sum_actual_weight_kg: sum_actual,
      diff_kg: diff,
      over_tolerance: overTolerance,
      forced: !!(overTolerance && args.force),
    },
  };
}

// ── Scan box (lock / extend session) ────────────────────────

export async function scanBox(
  staff: string,
  warehouseCode: string,
  args: { box_no: string }
): Promise<{
  active_session: {
    outbound_id: string;
    scanned: string[];
    remaining: string[];
    total: number;
    complete_ready: boolean;
    same_client_hint: SameClientHintEntry[];
  };
}> {
  const db = await connectToDatabase();
  const now = new Date();

  const box = await findSealedBoxByBoxNo(args.box_no);
  if (!box) throw new ApiError("PACK_BOX_NOT_FOUND", { boxNo: args.box_no });
  if (box.status !== "sealed") {
    throw new ApiError("PACK_BOX_NOT_SEALED", { boxNo: args.box_no });
  }

  // Derive the outbound this box belongs to (first item's outbound_id is
  // canonical for the pack-v1 model).
  const ownerOutboundId = box.items?.[0]?.outbound_id
    ? String(box.items[0].outbound_id)
    : null;
  if (!ownerOutboundId) {
    throw new ApiError("PACK_BOX_NOT_FOUND", { boxNo: args.box_no });
  }
  const outbound = await getOutboundById(ownerOutboundId);
  if (!outbound) {
    throw new ApiError("OUTBOUND_NOT_FOUND", { orderId: ownerOutboundId });
  }
  if (outbound.status !== "weight_verified") {
    throw new ApiError("PACK_OUTBOUND_NOT_WEIGHT_VERIFIED", {
      orderId: ownerOutboundId,
      status: outbound.status,
    });
  }

  // Existing lock?
  const existingLock = await db
    .collection(SESSION_LOCKS)
    .findOne({ _id: warehouseCode as any });

  if (existingLock) {
    const lockedOid = String(existingLock.outbound_id);
    if (lockedOid !== ownerOutboundId) {
      // Lock is for another outbound. If same staff, treat as a wrong-scan
      // guidance error; otherwise it's session-busy.
      if (existingLock.locked_by && existingLock.locked_by !== staff) {
        throw new ApiError("PACK_SESSION_BUSY", {
          outboundId: lockedOid,
          staff: existingLock.locked_by,
        });
      }
      throw new ApiError("PACK_PALLETIZE_WRONG_OUTBOUND", {
        locked: lockedOid,
        scanned: ownerOutboundId,
      });
    }
  }

  // Acquire or extend the lock.
  const totalBoxes = await listSealedBoxesForOutbound(ownerOutboundId);
  const allBoxNos = totalBoxes.map((b) => b.box_no);
  const scannedSet = new Set<string>(
    existingLock?.scanned_box_nos || []
  );
  const isFirstScan = !existingLock;
  scannedSet.add(args.box_no);

  await db.collection(SESSION_LOCKS).updateOne(
    { _id: warehouseCode as any },
    {
      $set: {
        outbound_id: ownerOutboundId,
        locked_by: staff,
        locked_at: existingLock?.locked_at || now,
        scanned_box_nos: [...scannedSet],
        total_box_count: allBoxNos.length,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  // Mark this box as palletize-scanned
  await db.collection(PACK_BOXES).updateOne(
    { _id: (box as any)._id },
    {
      $set: {
        palletize_scanned_at: now,
        palletize_scanned_by: staff,
        updatedAt: now,
      },
    }
  );

  if (isFirstScan) {
    await writeWeighPalletizeAudit(staff, "palletize.start_session", {
      outbound_id: ownerOutboundId,
      first_box_no: args.box_no,
      total_boxes: allBoxNos.length,
    });
  }
  await writeWeighPalletizeAudit(staff, "palletize.scan_box", {
    outbound_id: ownerOutboundId,
    box_no: args.box_no,
    scanned_count: scannedSet.size,
    total: allBoxNos.length,
  });

  const remaining = allBoxNos.filter((bn) => !scannedSet.has(bn));
  const same_client_hint = await buildSameClientHint(
    String(outbound.client_id),
    ownerOutboundId
  );

  return {
    active_session: {
      outbound_id: ownerOutboundId,
      scanned: [...scannedSet],
      remaining,
      total: allBoxNos.length,
      complete_ready: remaining.length === 0,
      same_client_hint,
    },
  };
}

// ── Complete (write outbound, release lock) ─────────────────

export async function completeSession(
  staff: string,
  warehouseCode: string,
  args: { outbound_id: string }
): Promise<{
  outbound_id: string;
  status: string;
  same_client_hint: SameClientHintEntry[];
}> {
  const db = await connectToDatabase();
  const now = new Date();

  const lock = await db
    .collection(SESSION_LOCKS)
    .findOne({ _id: warehouseCode as any });
  if (!lock) throw new ApiError("PACK_NO_ACTIVE_SESSION");
  if (String(lock.outbound_id) !== args.outbound_id) {
    throw new ApiError("PACK_PALLETIZE_WRONG_OUTBOUND", {
      locked: String(lock.outbound_id),
      scanned: args.outbound_id,
    });
  }

  const outbound = await getOutboundById(args.outbound_id);
  if (!outbound) {
    throw new ApiError("OUTBOUND_NOT_FOUND", { orderId: args.outbound_id });
  }
  if (outbound.status !== "weight_verified") {
    throw new ApiError("PACK_OUTBOUND_NOT_WEIGHT_VERIFIED", {
      orderId: args.outbound_id,
      status: outbound.status,
    });
  }

  const boxes = await listSealedBoxesForOutbound(args.outbound_id);
  const scanned = new Set<string>(lock.scanned_box_nos || []);
  const missing = boxes.filter((b) => !scanned.has(b.box_no));
  if (missing.length > 0) {
    throw new ApiError("PACK_PALLETIZE_INCOMPLETE", {
      missing: missing.length,
      total: boxes.length,
    });
  }

  // Build denormalized boxes[] payload for the outbound.
  const denormBoxes = boxes.map((b) => ({
    box_no: b.box_no,
    length: Number(b.length || 0),
    width: Number(b.width || 0),
    height: Number(b.height || 0),
    weight: Number(b.weight || 0),
    tracking_no: b.items?.[0]?.tracking_no ?? null,
    sealed_at: b.sealed_at ?? null,
  }));

  const totalWeight =
    Math.round(
      boxes.reduce((s, b) => s + Number(b.weight || 0), 0) * 1000
    ) / 1000;

  await db.collection(OUTBOUNDS).updateOne(
    { _id: args.outbound_id as any, status: "weight_verified" },
    {
      $set: {
        status: "pending_client_label",
        actual_weight_kg: totalWeight,
        boxes: denormBoxes,
        palletized_at: now,
        updatedAt: now,
        updatedBy: staff,
      },
    }
  );

  // Release lock
  await db.collection(SESSION_LOCKS).deleteOne({ _id: warehouseCode as any });

  await writeWeighPalletizeAudit(staff, "palletize.complete", {
    outbound_id: args.outbound_id,
    box_count: boxes.length,
    total_weight_kg: totalWeight,
  });

  const same_client_hint = await buildSameClientHint(
    String(outbound.client_id),
    args.outbound_id
  );

  return {
    outbound_id: args.outbound_id,
    status: "pending_client_label",
    same_client_hint,
  };
}

// ── Cancel session lock (keep scans) ────────────────────────

export async function cancelSession(
  staff: string,
  warehouseCode: string
): Promise<{ ok: true }> {
  const db = await connectToDatabase();
  const lock = await db
    .collection(SESSION_LOCKS)
    .findOne({ _id: warehouseCode as any });
  if (!lock) {
    // No-op — but treat as ok so the UI can clear local state cleanly.
    return { ok: true };
  }
  await db.collection(SESSION_LOCKS).deleteOne({ _id: warehouseCode as any });
  await writeWeighPalletizeAudit(staff, "palletize.cancel_session", {
    outbound_id: String(lock.outbound_id),
    scanned_count: (lock.scanned_box_nos || []).length,
  });
  return { ok: true };
}

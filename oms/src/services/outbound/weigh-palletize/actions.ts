import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { PackBoxV1 } from "@/types/PackBoxV1";
import { sealBox } from "@/services/outbound/pack-v1/actions";
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
// P18 — P12 path now triggers the warehouse auto-fetch immediately at
// 完成置板 instead of parking at pending_client_label. P19 makes the
// session multi-outbound so the explicit list (not a sibling sweep)
// drives the batch fetch.
import {
  autoBatchFetchLabels,
  fetchLabelMultiBox,
} from "@/services/outbound/wmsFlow";

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

  let box = await findSealedBoxByBoxNo(args.box_no);
  if (!box) throw new ApiError("PACK_BOX_NOT_FOUND", { boxNo: args.box_no });
  // Auto-seal：進入秤重 = 倉庫物理上已封箱，系統靜默 seal
  if (box.status === "open" && (box.items?.length ?? 0) > 0) {
    await sealBox(staff, args.box_no);
    box = await findSealedBoxByBoxNo(args.box_no);
    if (!box) throw new ApiError("PACK_BOX_NOT_FOUND", { boxNo: args.box_no });
  }
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

// P19 — canonical destination key for "are these two outbounds combinable
// in one palletize session?". Mirrors the auto-batch criteria from P17.5
// (client + warehouse + carrier + receiver address exact-match). A subset
// of relevant address fields is intentional — we want phone/postcode
// variants on the SAME shipping address to still combine.
function destinationKey(ob: any): string {
  const a = ob.receiver_address ?? {};
  return JSON.stringify({
    client_id: String(ob.client_id),
    warehouseCode: ob.warehouseCode,
    carrier_code: ob.carrier_code,
    carrier_account_id: ob.carrier_account_id ?? null,
    country_code: a.country_code ?? null,
    city: a.city ?? null,
    address: a.address ?? null,
    postal_code: a.postal_code ?? null,
  });
}

// Reads the lock's outbound list, accommodating legacy single-outbound docs.
function lockOutboundIds(lock: any): string[] {
  if (!lock) return [];
  if (Array.isArray(lock.outbound_ids) && lock.outbound_ids.length > 0)
    return lock.outbound_ids.map((id: any) => String(id));
  if (lock.outbound_id) return [String(lock.outbound_id)];
  return [];
}

export async function scanBox(
  staff: string,
  warehouseCode: string,
  args: { box_no: string }
): Promise<{
  active_session: {
    outbound_id: string;
    outbound_ids: string[];
    scanned: string[];
    remaining: string[];
    total: number;
    complete_ready: boolean;
    same_client_hint: SameClientHintEntry[];
  };
}> {
  const db = await connectToDatabase();
  const now = new Date();

  let box = await findSealedBoxByBoxNo(args.box_no);
  if (!box) throw new ApiError("PACK_BOX_NOT_FOUND", { boxNo: args.box_no });
  // Auto-seal：palletize scan 同樣假設物理已封
  if (box.status === "open" && (box.items?.length ?? 0) > 0) {
    await sealBox(staff, args.box_no);
    box = await findSealedBoxByBoxNo(args.box_no);
    if (!box) throw new ApiError("PACK_BOX_NOT_FOUND", { boxNo: args.box_no });
  }
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

  // P19 — multi-outbound session: lock.outbound_ids[] holds every outbound
  // currently in the session. A new outbound joins automatically if it
  // shares (client, warehouse, carrier, address) with the existing set;
  // otherwise we reject the scan as a wrong-shipment guard.
  const existingLock = await db
    .collection(SESSION_LOCKS)
    .findOne({ _id: warehouseCode as any });

  const sessionOutboundIds = lockOutboundIds(existingLock);
  const alreadyInSession = sessionOutboundIds.includes(ownerOutboundId);

  if (
    existingLock &&
    existingLock.locked_by &&
    existingLock.locked_by !== staff
  ) {
    throw new ApiError("PACK_SESSION_BUSY", {
      outboundId: sessionOutboundIds[0] ?? "",
      staff: existingLock.locked_by,
    });
  }

  if (existingLock && !alreadyInSession) {
    // Compatibility check against any one of the existing outbounds in the
    // session (they're all already mutually compatible because they got
    // added through this same check).
    const probeId = sessionOutboundIds[0]!;
    const probe = await getOutboundById(probeId);
    if (!probe || destinationKey(probe) !== destinationKey(outbound)) {
      throw new ApiError("PACK_PALLETIZE_WRONG_OUTBOUND", {
        locked: probeId,
        scanned: ownerOutboundId,
      });
    }
  }

  // Aggregate sealed boxes across every outbound in the (possibly
  // expanded) session.
  const expandedOutboundIds = alreadyInSession
    ? sessionOutboundIds
    : [...sessionOutboundIds, ownerOutboundId];
  const allBoxes = (
    await Promise.all(
      expandedOutboundIds.map((oid) => listSealedBoxesForOutbound(oid))
    )
  ).flat();
  const allBoxNos = allBoxes.map((b) => b.box_no);
  const scannedSet = new Set<string>(existingLock?.scanned_box_nos || []);
  const isFirstScan = !existingLock;
  scannedSet.add(args.box_no);

  await db.collection(SESSION_LOCKS).updateOne(
    { _id: warehouseCode as any },
    {
      $set: {
        // outbound_id mirrors outbound_ids[0] for legacy reads; new code
        // should read outbound_ids[].
        outbound_id: expandedOutboundIds[0],
        outbound_ids: expandedOutboundIds,
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
  } else if (!alreadyInSession) {
    await writeWeighPalletizeAudit(staff, "palletize.extend_session", {
      outbound_id: ownerOutboundId,
      session_size: expandedOutboundIds.length,
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
      outbound_id: expandedOutboundIds[0]!,
      outbound_ids: expandedOutboundIds,
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
  args: { outbound_id?: string }
): Promise<{
  outbound_id: string;
  outbound_ids: string[];
  status: string;
  same_client_hint: SameClientHintEntry[];
}> {
  const db = await connectToDatabase();
  const now = new Date();

  const lock = await db
    .collection(SESSION_LOCKS)
    .findOne({ _id: warehouseCode as any });
  if (!lock) throw new ApiError("PACK_NO_ACTIVE_SESSION");
  // P19 — completeSession now resolves the WHOLE session: every outbound
  // currently in lock.outbound_ids[] is palletize-completed in one shot.
  // The optional args.outbound_id is kept for back-compat with older
  // clients but only validated to belong to the session.
  const sessionIds = lockOutboundIds(lock);
  if (sessionIds.length === 0) throw new ApiError("PACK_NO_ACTIVE_SESSION");
  if (args.outbound_id && !sessionIds.includes(args.outbound_id)) {
    throw new ApiError("PACK_PALLETIZE_WRONG_OUTBOUND", {
      locked: sessionIds[0]!,
      scanned: args.outbound_id,
    });
  }

  // Load + sanity-check every outbound in the session.
  const outbounds: any[] = [];
  for (const oid of sessionIds) {
    const ob = await getOutboundById(oid);
    if (!ob) {
      throw new ApiError("OUTBOUND_NOT_FOUND", { orderId: oid });
    }
    if (ob.status !== "weight_verified") {
      throw new ApiError("PACK_OUTBOUND_NOT_WEIGHT_VERIFIED", {
        orderId: oid,
        status: ob.status,
      });
    }
    outbounds.push(ob);
  }

  // Every sealed box across every session outbound must be scanned.
  const scanned = new Set<string>(lock.scanned_box_nos || []);
  const allBoxesByOutbound = new Map<string, PackBoxV1[]>();
  let missingCount = 0;
  let totalBoxes = 0;
  for (const oid of sessionIds) {
    const boxes = await listSealedBoxesForOutbound(oid);
    allBoxesByOutbound.set(oid, boxes);
    totalBoxes += boxes.length;
    missingCount += boxes.filter((b) => !scanned.has(b.box_no)).length;
  }
  if (missingCount > 0) {
    throw new ApiError("PACK_PALLETIZE_INCOMPLETE", {
      missing: missingCount,
      total: totalBoxes,
    });
  }

  // Write the per-outbound denorm boxes[] + palletized_at marker for each
  // outbound in the session. Done before the label fetch so the data is
  // consistent even if the carrier API call fails.
  for (const ob of outbounds) {
    const boxes = allBoxesByOutbound.get(String(ob._id)) || [];
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
      { _id: ob._id as any, status: "weight_verified" },
      {
        $set: {
          actual_weight_kg: totalWeight,
          boxes: denormBoxes,
          palletized_at: now,
          updatedAt: now,
          updatedBy: staff,
        },
      }
    );
  }

  // Release lock before triggering label fetch (the fetch can take a few
  // hundred ms and we don't want to hold the warehouse-wide lock during
  // an outbound network call).
  await db.collection(SESSION_LOCKS).deleteOne({ _id: warehouseCode as any });

  await writeWeighPalletizeAudit(staff, "palletize.complete", {
    outbound_ids: sessionIds,
    box_count: totalBoxes,
  });

  // P19 — single batch label fetch for the entire session. With the
  // session-wide complete we have an explicit list, so we call
  // autoBatchFetchLabels directly (no need for the implicit sibling sweep
  // that P18 used when single-outbound completeSession could miss
  // co-shipped outbounds).
  let label_fetch_outcome: "obtained" | "batched" | "failed" = "failed";
  let label_fetch_error: string | null = null;
  const allAuto = outbounds.every(
    (o: any) => o.processing_preference === "auto"
  );
  if (allAuto) {
    try {
      if (sessionIds.length > 1) {
        await autoBatchFetchLabels(sessionIds);
        label_fetch_outcome = "batched";
      } else {
        await fetchLabelMultiBox(sessionIds[0]!, "system", null);
        label_fetch_outcome = "obtained";
      }
    } catch (err) {
      label_fetch_error = (err as any)?.message ?? String(err);
      console.error(
        `[palletize.complete] label fetch failed for session ${sessionIds.join(",")}:`,
        label_fetch_error
      );
    }
  }

  // Pull the final state across every outbound in the session for the
  // response so the UI can render N rows of (status, tracking, label).
  const finalDocs = await db
    .collection(OUTBOUNDS)
    .find({ _id: { $in: sessionIds as any } })
    .toArray();
  const finalById = new Map<string, any>(
    finalDocs.map((d: any) => [String(d._id), d])
  );
  const allBoxRows = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id: { $in: sessionIds } })
    .sort({ outbound_id: 1, box_no: 1 })
    .toArray();
  const boxRowsByOutbound = new Map<string, any[]>();
  for (const b of allBoxRows as any[]) {
    const arr = boxRowsByOutbound.get(String(b.outbound_id)) || [];
    arr.push(b);
    boxRowsByOutbound.set(String(b.outbound_id), arr);
  }

  // same_client_hint is keyed on the primary outbound for back-compat;
  // siblings inside the session aren't surfaced as "next to do" because
  // they're already done.
  const primary = outbounds[0];
  const same_client_hint = await buildSameClientHint(
    String(primary.client_id),
    String(primary._id)
  );

  const outboundsPayload = sessionIds.map((oid) => {
    const f = finalById.get(oid);
    const rows = boxRowsByOutbound.get(oid) ?? [];
    return {
      outbound_id: oid,
      status: f?.status ?? "label_obtained",
      label_url: f?.label_url ?? null,
      tracking_no: f?.tracking_no ?? null,
      label_batch_id: f?.label_batch_id ?? null,
      held_reason: f?.held_reason ?? null,
      boxes: rows.map((b: any) => ({
        outbound_id: oid,
        box_no: b.box_no,
        weight_actual: b.weight_actual ?? null,
        dimensions: b.dimensions ?? null,
        tracking_no_carrier: b.tracking_no_carrier ?? null,
        label_pdf_path: b.label_pdf_path ?? null,
      })),
    };
  });

  return {
    // back-compat fields keyed on the primary
    outbound_id: sessionIds[0]!,
    outbound_ids: sessionIds,
    status: outboundsPayload[0]?.status ?? "label_obtained",
    label_url: outboundsPayload[0]?.label_url ?? null,
    tracking_no: outboundsPayload[0]?.tracking_no ?? null,
    label_batch_id: outboundsPayload[0]?.label_batch_id ?? null,
    held_reason: outboundsPayload[0]?.held_reason ?? null,
    boxes: outboundsPayload.flatMap((p) => p.boxes),
    outbounds: outboundsPayload,
    label_fetch_outcome,
    label_fetch_error,
    same_client_hint,
  } as any;
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

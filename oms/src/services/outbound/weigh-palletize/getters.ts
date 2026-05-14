import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { PackBoxV1 } from "@/types/PackBoxV1";
import { TARE_KG, WEIGHT_TOLERANCE_KG } from "./weight";
import { ObjectId } from "mongodb";

// Statuses that may still have boxes pending秤重 — once palletize completes,
// the outbound moves to pending_client_label and drops out of these queues.
const WEIGH_RELEVANT_OUTBOUND_STATUSES = [
  "packed",
  "weighing",
  "weight_verified",
];

const NON_LIVE_OUTBOUND_STATUSES = [
  "departed",
  "cancelled",
  "cancelled_after_label",
];

// ── Loaders ─────────────────────────────────────────────────

export async function loadClientMap(
  client_ids: string[]
): Promise<Map<string, { code: string; name: string }>> {
  if (client_ids.length === 0) return new Map();
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.CLIENT)
    .find({
      _id: {
        $in: client_ids.map((id) =>
          ObjectId.isValid(id) ? new ObjectId(id) : (id as any)
        ) as any,
      },
    })
    .toArray();
  const map = new Map<string, { code: string; name: string }>();
  for (const c of docs) {
    const id = String(c._id);
    map.set(id, {
      code: c.code || c.client_code || id.slice(-4).toUpperCase(),
      name:
        c.company_name ||
        c.company_info?.legal_name ||
        c.display_name ||
        c.email ||
        id,
    });
  }
  return map;
}

export async function findSealedBoxByBoxNo(
  boxNo: string
): Promise<PackBoxV1 | null> {
  const db = await connectToDatabase();
  const doc = await db.collection(collections.PACK_BOX_V1).findOne({
    box_no: boxNo.trim(),
  });
  return (doc as unknown as PackBoxV1) || null;
}

export async function getOutboundById(outbound_id: string) {
  const db = await connectToDatabase();
  return db.collection(collections.OUTBOUND).findOne({ _id: outbound_id as any });
}

export async function getSessionLock(warehouseCode: string) {
  const db = await connectToDatabase();
  return db
    .collection(collections.PACK_SESSION_LOCK)
    .findOne({ _id: warehouseCode as any });
}

// ── State endpoint payload ─────────────────────────────────

export type WeighQueueBox = {
  box_no: string;
  weighed: boolean;
  length: number;
  width: number;
  height: number;
  weight: number;
  /** Σ inbound.actualWeight for items in this box (rounded to 3 decimals). */
  sum_actual_weight_kg: number;
  /** sum_actual + tare(1 kg) — what staff is expected to measure ±0.5 kg. */
  expected_weight_kg: number;
  /** Tare constant exposed so the UI can show the formula breakdown. */
  tare_kg: number;
  /** Tolerance constant exposed for consistent client-side checks. */
  tolerance_kg: number;
};

export type WeighQueueEntry = {
  outbound_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  shipment_type: "single" | "consolidated";
  outbound_status: string;
  boxes: WeighQueueBox[];
};

export type PalletizeQueueBox = {
  box_no: string;
  length: number;
  width: number;
  height: number;
  weight: number;
};

export type PalletizeQueueEntry = {
  outbound_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  shipment_type: "single" | "consolidated";
  outbound_status: string;
  box_count: number;
  total_weight_kg: number;
  boxes: PalletizeQueueBox[];
};

export type SameClientHintEntry = {
  outbound_id: string;
  status: string;
};

export type ActiveSession = {
  outbound_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  locked_by: string;
  locked_at: Date;
  scanned_box_nos: string[];
  remaining_box_nos: string[];
  total: number;
  complete_ready: boolean;
  same_client_hint: SameClientHintEntry[];
};

export type WeighPalletizeState = {
  weigh_queue: WeighQueueEntry[];
  palletize_queue: PalletizeQueueEntry[];
  active_session: ActiveSession | null;
};

export async function getWeighPalletizeState(
  warehouseCode: string
): Promise<WeighPalletizeState> {
  const db = await connectToDatabase();

  // 1. Live outbounds in weigh-relevant statuses (packed / weighing /
  //    weight_verified). Optionally scoped to this warehouse.
  const outboundQuery: any = {
    status: { $in: WEIGH_RELEVANT_OUTBOUND_STATUSES },
  };
  if (warehouseCode) outboundQuery.warehouseCode = warehouseCode;
  const outbounds = await db
    .collection(collections.OUTBOUND)
    .find(outboundQuery)
    .toArray();

  const outboundById = new Map<string, any>();
  for (const o of outbounds) outboundById.set(String(o._id), o);
  const outboundIds = [...outboundById.keys()];

  // 2. All sealed boxes whose items reference any of those outbounds. We pull
  //    by outbound_id via items.outbound_id.
  const sealedBoxes = outboundIds.length
    ? ((await db
        .collection(collections.PACK_BOX_V1)
        .find({
          status: "sealed",
          "items.outbound_id": { $in: outboundIds },
        })
        .toArray()) as unknown as PackBoxV1[])
    : [];

  // Group boxes by outbound_id. A box could (in theory) carry items for
  // multiple outbounds — in practice pack-v1 keeps boxes single-client and
  // each item carries its own outbound_id. We attach each box to every
  // outbound it touches so weigh/palletize logic stays correct.
  const boxesByOutbound = new Map<string, PackBoxV1[]>();
  for (const b of sealedBoxes) {
    const seen = new Set<string>();
    for (const it of b.items || []) {
      const oid = String(it.outbound_id);
      if (seen.has(oid)) continue;
      seen.add(oid);
      const arr = boxesByOutbound.get(oid) || [];
      arr.push(b);
      boxesByOutbound.set(oid, arr);
    }
  }

  // Pre-compute expected weight per box (sum of inbound actualWeight + 1kg
  // tare). Build a single lookup keyed by box_no.
  const expectedByBoxNo = new Map<
    string,
    { sum_actual: number; expected: number }
  >();
  {
    const allInboundIds = new Set<string>();
    for (const b of sealedBoxes) {
      for (const it of b.items || []) allInboundIds.add(String(it.inbound_id));
    }
    let weightByInbound = new Map<string, number>();
    if (allInboundIds.size > 0) {
      const inboundDocs = await db
        .collection(collections.INBOUND)
        .find(
          { _id: { $in: [...allInboundIds] } },
          { projection: { actualWeight: 1 } } as any
        )
        .toArray();
      for (const d of inboundDocs) {
        const w = Number((d as any).actualWeight || 0);
        if (Number.isFinite(w) && w > 0) {
          weightByInbound.set(String(d._id), w);
        }
      }
    }
    for (const b of sealedBoxes) {
      let sum = 0;
      for (const it of b.items || []) {
        sum += weightByInbound.get(String(it.inbound_id)) || 0;
      }
      const sum_actual = Math.round(sum * 1000) / 1000;
      const expected = Math.round((sum_actual + TARE_KG) * 1000) / 1000;
      expectedByBoxNo.set(b.box_no, { sum_actual, expected });
    }
  }

  // 3. Client map for naming
  const clientIdSet = new Set<string>();
  for (const o of outbounds) clientIdSet.add(String(o.client_id));
  const clientMap = await loadClientMap([...clientIdSet]);

  // 4. Active session lock (per warehouse)
  const lockDoc = await db
    .collection(collections.PACK_SESSION_LOCK)
    .findOne({ _id: warehouseCode as any });

  const lockedOutboundId = lockDoc ? String(lockDoc.outbound_id) : null;

  // 5. Build queues
  const weigh_queue: WeighQueueEntry[] = [];
  const palletize_queue: PalletizeQueueEntry[] = [];

  for (const oid of outboundIds) {
    const outbound = outboundById.get(oid);
    if (!outbound) continue;
    const boxes = boxesByOutbound.get(oid) || [];
    if (boxes.length === 0) continue; // nothing sealed yet — wait

    const client_id = String(outbound.client_id);
    const c = clientMap.get(client_id);
    const client_code = c?.code || client_id.slice(-4).toUpperCase();
    const client_name = c?.name || client_id;

    const pendingWeighBoxes = boxes.filter((b) => !b.weighed_at);

    // Weigh queue: any outbound with at least 1 not-yet-weighed sealed box.
    if (pendingWeighBoxes.length > 0) {
      weigh_queue.push({
        outbound_id: oid,
        client_id,
        client_code,
        client_name,
        shipment_type: outbound.shipment_type || "consolidated",
        outbound_status: outbound.status,
        boxes: boxes.map((b) => {
          const exp = expectedByBoxNo.get(b.box_no);
          return {
            box_no: b.box_no,
            weighed: !!b.weighed_at,
            length: Number(b.length || 0),
            width: Number(b.width || 0),
            height: Number(b.height || 0),
            weight: Number(b.weight || 0),
            sum_actual_weight_kg: exp?.sum_actual || 0,
            expected_weight_kg: exp?.expected || TARE_KG,
            tare_kg: TARE_KG,
            tolerance_kg: WEIGHT_TOLERANCE_KG,
          };
        }),
      });
      continue;
    }

    // All boxes weighed — palletize queue (unless this is the active lock).
    if (outbound.status === "weight_verified" && lockedOutboundId !== oid) {
      const allScanned = boxes.every((b) => !!b.palletize_scanned_at);
      if (allScanned) continue; // shouldn't happen until /complete is called
      palletize_queue.push({
        outbound_id: oid,
        client_id,
        client_code,
        client_name,
        shipment_type: outbound.shipment_type || "consolidated",
        outbound_status: outbound.status,
        box_count: boxes.length,
        total_weight_kg:
          Math.round(
            boxes.reduce((s, b) => s + Number(b.weight || 0), 0) * 1000
          ) / 1000,
        boxes: boxes.map((b) => ({
          box_no: b.box_no,
          length: Number(b.length || 0),
          width: Number(b.width || 0),
          height: Number(b.height || 0),
          weight: Number(b.weight || 0),
        })),
      });
    }
  }

  // 6. Active session detail (if any)
  let active_session: ActiveSession | null = null;
  if (lockDoc && lockedOutboundId) {
    const outbound = outboundById.get(lockedOutboundId);
    if (outbound) {
      const boxes = boxesByOutbound.get(lockedOutboundId) || [];
      const allBoxNos = boxes.map((b) => b.box_no);
      const scanned = new Set<string>(lockDoc.scanned_box_nos || []);
      const remaining = allBoxNos.filter((bn) => !scanned.has(bn));
      const client_id = String(outbound.client_id);
      const c = clientMap.get(client_id);

      // same-client hint
      const hintDocs = await db
        .collection(collections.OUTBOUND)
        .find({
          client_id,
          _id: { $ne: lockedOutboundId as any },
          status: { $nin: NON_LIVE_OUTBOUND_STATUSES },
        })
        .project({ _id: 1, status: 1 })
        .toArray();
      const same_client_hint: SameClientHintEntry[] = hintDocs.map((d: any) => ({
        outbound_id: String(d._id),
        status: d.status,
      }));

      active_session = {
        outbound_id: lockedOutboundId,
        client_id,
        client_code: c?.code || client_id.slice(-4).toUpperCase(),
        client_name: c?.name || client_id,
        locked_by: lockDoc.locked_by,
        locked_at: lockDoc.locked_at,
        scanned_box_nos: [...scanned],
        remaining_box_nos: remaining,
        total: allBoxNos.length,
        complete_ready: remaining.length === 0 && allBoxNos.length > 0,
        same_client_hint,
      };
    }
  }

  // Stable sort: oldest outbound first (createdAt asc)
  weigh_queue.sort((a, b) => a.outbound_id.localeCompare(b.outbound_id));
  palletize_queue.sort((a, b) => a.outbound_id.localeCompare(b.outbound_id));

  return { weigh_queue, palletize_queue, active_session };
}

export async function buildSameClientHint(
  client_id: string,
  exclude_outbound_id: string
): Promise<SameClientHintEntry[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.OUTBOUND)
    .find({
      client_id,
      _id: { $ne: exclude_outbound_id as any },
      status: { $nin: NON_LIVE_OUTBOUND_STATUSES },
    })
    .project({ _id: 1, status: 1 })
    .toArray();
  return docs.map((d: any) => ({
    outbound_id: String(d._id),
    status: d.status,
  }));
}

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { PackBoxV1 } from "@/types/PackBoxV1";
import { TARE_KG, WEIGHT_TOLERANCE_KG } from "./weight";
import { destinationKey } from "./actions";
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
  /** True if this outbound shares client + warehouse + carrier + receiver
   *  with the active session, i.e. its boxes can be palletize-scanned
   *  into the same session without triggering PACK_PALLETIZE_WRONG_OUTBOUND. */
  groupable_with_active: boolean;
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
  /** Same semantics as WeighQueueEntry.groupable_with_active. */
  groupable_with_active: boolean;
};

export type SameClientHintEntry = {
  outbound_id: string;
  status: string;
};

export type ActiveSessionOutbound = {
  outbound_id: string;
  scanned_count: number;
  total: number;
};

export type ActiveSession = {
  // back-compat primary (= outbound_ids[0])
  outbound_id: string;
  outbound_ids: string[];
  outbounds: ActiveSessionOutbound[];
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

  // P19 — session may hold multiple outbound_ids[]; any of them should be
  // hidden from the palletize_queue (they're already "in" the session).
  const lockedOutboundIds: Set<string> = new Set();
  if (lockDoc) {
    if (Array.isArray(lockDoc.outbound_ids)) {
      for (const id of lockDoc.outbound_ids) lockedOutboundIds.add(String(id));
    }
    if (lockDoc.outbound_id) lockedOutboundIds.add(String(lockDoc.outbound_id));
  }

  // 5. Build queues
  const weigh_queue: WeighQueueEntry[] = [];
  const palletize_queue: PalletizeQueueEntry[] = [];

  // P19+ UX：active session 嘅 primary outbound destination key 用嚟標 same-group
  // entries，frontend 排頭 + 綠 highlight + 「可加入當前組」chip。
  let activeDestKey: string | null = null;
  if (lockDoc) {
    const primaryOid =
      Array.isArray(lockDoc.outbound_ids) && lockDoc.outbound_ids.length > 0
        ? String(lockDoc.outbound_ids[0])
        : lockDoc.outbound_id
        ? String(lockDoc.outbound_id)
        : null;
    if (primaryOid) {
      const primary = outboundById.get(primaryOid);
      if (primary) {
        activeDestKey = destinationKey(primary);
      } else {
        // active session 嘅 outbound 已經跌出 weigh-relevant statuses（被
        // complete 過），單獨 load 一次去 derive key。罕見路徑但要 safe。
        const fresh = await db
          .collection(collections.OUTBOUND)
          .findOne({ _id: primaryOid as any });
        if (fresh) activeDestKey = destinationKey(fresh);
      }
    }
  }
  const groupableFor = (ob: any): boolean =>
    !!activeDestKey && destinationKey(ob) === activeDestKey;

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
        groupable_with_active: groupableFor(outbound),
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

    // All boxes weighed — palletize queue (unless this is in the active session).
    if (outbound.status === "weight_verified" && !lockedOutboundIds.has(oid)) {
      const allScanned = boxes.every((b) => !!b.palletize_scanned_at);
      if (allScanned) continue; // shouldn't happen until /complete is called
      palletize_queue.push({
        outbound_id: oid,
        client_id,
        client_code,
        client_name,
        shipment_type: outbound.shipment_type || "consolidated",
        outbound_status: outbound.status,
        groupable_with_active: groupableFor(outbound),
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

  // 6. Active session detail (if any). P19 — session may span multiple
  // outbound_ids[]; we aggregate boxes + scans across the whole session.
  let active_session: ActiveSession | null = null;
  if (lockDoc) {
    const sessionOutboundIds: string[] =
      Array.isArray(lockDoc.outbound_ids) && lockDoc.outbound_ids.length > 0
        ? lockDoc.outbound_ids.map((id: any) => String(id))
        : lockDoc.outbound_id
        ? [String(lockDoc.outbound_id)]
        : [];
    const primaryOid = sessionOutboundIds[0];
    const primary = primaryOid ? outboundById.get(primaryOid) : null;
    if (primary && sessionOutboundIds.length > 0) {
      const scanned = new Set<string>(lockDoc.scanned_box_nos || []);
      let allBoxNos: string[] = [];
      const perOutbound: ActiveSessionOutbound[] = [];
      for (const oid of sessionOutboundIds) {
        const boxes = boxesByOutbound.get(oid) || [];
        const ids = boxes.map((b) => b.box_no);
        allBoxNos = allBoxNos.concat(ids);
        perOutbound.push({
          outbound_id: oid,
          scanned_count: ids.filter((id) => scanned.has(id)).length,
          total: ids.length,
        });
      }
      const remaining = allBoxNos.filter((bn) => !scanned.has(bn));
      const client_id = String(primary.client_id);
      const c = clientMap.get(client_id);

      // same-client hint excludes every outbound already in the session.
      const hintDocs = await db
        .collection(collections.OUTBOUND)
        .find({
          client_id,
          _id: { $nin: sessionOutboundIds as any },
          status: { $nin: NON_LIVE_OUTBOUND_STATUSES },
        })
        .project({ _id: 1, status: 1 })
        .toArray();
      const same_client_hint: SameClientHintEntry[] = hintDocs.map((d: any) => ({
        outbound_id: String(d._id),
        status: d.status,
      }));

      active_session = {
        outbound_id: primaryOid!,
        outbound_ids: sessionOutboundIds,
        outbounds: perOutbound,
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

  // Sort: groupable-with-active 排頭（綠 highlight，倉庫員一眼見到可以一齊
  // 加入當前組），其餘按 outbound_id 字典序。
  const queueSort = (a: { groupable_with_active: boolean; outbound_id: string }, b: typeof a) => {
    if (a.groupable_with_active !== b.groupable_with_active) {
      return a.groupable_with_active ? -1 : 1;
    }
    return a.outbound_id.localeCompare(b.outbound_id);
  };
  weigh_queue.sort(queueSort);
  palletize_queue.sort(queueSort);

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

import { collections } from "@/cst/collections";
import { PACK } from "@/cst/pack";
import { connectToDatabase } from "@/lib/mongo";
import { PackBoxV1 } from "@/types/PackBoxV1";
import { ObjectId } from "mongodb";

const PACK_READY_STATUSES = ["picked", "packing"];

export type StationDeskItem = {
  inbound_id: string;
  outbound_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  tracking_no: string;
  product_name: string | null;
  shipment_type: "single" | "consolidated";
  declared_items_count: number;
  contains_battery: boolean;
  contains_liquid: boolean;
};

export type StationOpenBoxItem = {
  inbound_id: string;
  outbound_id: string;
  tracking_no: string;
  product_name: string | null;
  client_id: string;
  client_code: string;
  client_name: string;
  contains_battery: boolean;
  contains_liquid: boolean;
};

export type StationOpenBox = Omit<PackBoxV1, "items"> & {
  client_name?: string;
  items: StationOpenBoxItem[];
};

export type StationState = {
  desk: StationDeskItem[];
  open_boxes: StationOpenBox[];
  stats: {
    desk_count: number;
    open_box_count: number;
    packed_item_count: number;
  };
};

async function loadClientMap(
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
      name: c.company_name || c.company_info?.legal_name || c.display_name || c.email || id,
    });
  }
  return map;
}

export async function getStationState(
  warehouseCode?: string
): Promise<StationState> {
  const db = await connectToDatabase();

  // 1. all open boxes (optionally per warehouse)
  const openBoxQuery: any = { status: PACK.STATUS.OPEN };
  if (warehouseCode) openBoxQuery.warehouse_code = warehouseCode;
  const openBoxes = (await db
    .collection(collections.PACK_BOX_V1)
    .find(openBoxQuery)
    .sort({ opened_at: 1 })
    .toArray()) as unknown as PackBoxV1[];

  const inboundIdsInOpenBoxes = new Set<string>();
  for (const b of openBoxes) {
    for (const it of b.items) inboundIdsInOpenBoxes.add(it.inbound_id);
  }

  // 2. inbound ids already in sealed boxes (already packed)
  const sealedBoxes = await db
    .collection(collections.PACK_BOX_V1)
    .find({ status: PACK.STATUS.SEALED })
    .project({ "items.inbound_id": 1 })
    .toArray();
  const sealedInboundIds = new Set<string>();
  for (const b of sealedBoxes) {
    for (const it of (b as any).items ?? []) {
      sealedInboundIds.add(it.inbound_id);
    }
  }

  // 3. outbound_requests in pack-ready status
  const outboundQuery: any = { status: { $in: PACK_READY_STATUSES } };
  if (warehouseCode) outboundQuery.warehouseCode = warehouseCode;
  const outbounds = await db
    .collection(collections.OUTBOUND)
    .find(outboundQuery)
    .toArray();
  const outboundById = new Map<string, any>();
  for (const o of outbounds) outboundById.set(String(o._id), o);

  // 4. links: outbound → inbound (active)
  const outboundIds = [...outboundById.keys()];
  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({
      outbound_id: { $in: outboundIds },
      unlinked_at: null,
    })
    .toArray();

  // Fetch inbounds for both desk candidates AND items already in open boxes
  // (so we can enrich box items with product name + safety flags).
  const inboundIdSet = new Set<string>(
    links.map((l: any) => String(l.inbound_id))
  );
  for (const id of inboundIdsInOpenBoxes) inboundIdSet.add(id);
  const allInboundIds = [...inboundIdSet];
  const inbounds = allInboundIds.length
    ? await db
        .collection(collections.INBOUND)
        .find({ _id: { $in: allInboundIds } })
        .toArray()
    : [];
  const inboundById = new Map<string, any>();
  for (const i of inbounds) inboundById.set(String(i._id), i);

  // 5. assemble desk items
  const clientIdSet = new Set<string>();
  for (const o of outbounds) clientIdSet.add(String(o.client_id));
  for (const b of openBoxes) clientIdSet.add(String(b.client_id));
  const clientMap = await loadClientMap([...clientIdSet]);

  const desk: StationDeskItem[] = [];
  for (const link of links) {
    const inbound_id = String(link.inbound_id);
    if (inboundIdsInOpenBoxes.has(inbound_id)) continue;
    if (sealedInboundIds.has(inbound_id)) continue;
    const inbound = inboundById.get(inbound_id);
    const outbound = outboundById.get(String(link.outbound_id));
    if (!inbound || !outbound) continue;
    const client_id = String(outbound.client_id);
    const c = clientMap.get(client_id);
    desk.push({
      inbound_id,
      outbound_id: String(outbound._id),
      client_id,
      client_code: c?.code || client_id.slice(-4).toUpperCase(),
      client_name: c?.name || client_id,
      tracking_no: inbound.tracking_no || inbound.tracking_no_normalized || "",
      product_name: inbound.product_name || null,
      shipment_type: outbound.shipment_type || "consolidated",
      declared_items_count: inbound.declared_items_count || 1,
      contains_battery: !!inbound.contains_battery,
      contains_liquid: !!inbound.contains_liquid,
    });
  }

  // enrich open boxes: items get product_name + client info + safety flags
  const open_boxes: StationOpenBox[] = openBoxes.map((b) => {
    const c = clientMap.get(String(b.client_id));
    const enrichedItems: StationOpenBoxItem[] = (b.items || []).map((it) => {
      const inbound = inboundById.get(String(it.inbound_id));
      return {
        inbound_id: it.inbound_id,
        outbound_id: it.outbound_id,
        tracking_no: it.tracking_no,
        product_name: inbound?.product_name || null,
        client_id: String(b.client_id),
        client_code: b.client_code,
        client_name: c?.name || b.client_code,
        contains_battery: !!inbound?.contains_battery,
        contains_liquid: !!inbound?.contains_liquid,
      };
    });
    return {
      ...b,
      client_name: c?.name,
      items: enrichedItems,
    };
  });

  const packed_item_count = openBoxes.reduce(
    (sum, b) => sum + (b.items?.length || 0),
    0
  );

  return {
    desk,
    open_boxes,
    stats: {
      desk_count: desk.length,
      open_box_count: open_boxes.length,
      packed_item_count,
    },
  };
}

export async function findInboundByTrackingOrId(
  scanCode: string
): Promise<any | null> {
  const db = await connectToDatabase();
  const t = scanCode.trim();
  if (!t) return null;
  return db.collection(collections.INBOUND).findOne({
    $or: [
      { tracking_no: t },
      { tracking_no_normalized: t },
      { _id: t },
    ],
  });
}

export async function findOpenBoxByBoxNo(
  boxNo: string
): Promise<PackBoxV1 | null> {
  const db = await connectToDatabase();
  const doc = await db.collection(collections.PACK_BOX_V1).findOne({
    box_no: boxNo.trim(),
    status: PACK.STATUS.OPEN,
  });
  return (doc as unknown as PackBoxV1) || null;
}

export async function findOpenBoxContainingInbound(
  inbound_id: string
): Promise<PackBoxV1 | null> {
  const db = await connectToDatabase();
  const doc = await db.collection(collections.PACK_BOX_V1).findOne({
    status: PACK.STATUS.OPEN,
    "items.inbound_id": inbound_id,
  });
  return (doc as unknown as PackBoxV1) || null;
}

export async function getActiveLinkForInbound(inbound_id: string) {
  const db = await connectToDatabase();
  return db.collection(collections.OUTBOUND_INBOUND_LINK).findOne({
    inbound_id,
    unlinked_at: null,
  });
}

export async function getOutboundById(outbound_id: string) {
  const db = await connectToDatabase();
  return db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
}

export async function getClientById(client_id: string) {
  const db = await connectToDatabase();
  const _id = ObjectId.isValid(client_id)
    ? new ObjectId(client_id)
    : (client_id as any);
  return db.collection(collections.CLIENT).findOne({ _id });
}

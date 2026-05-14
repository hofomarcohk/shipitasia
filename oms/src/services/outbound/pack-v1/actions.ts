import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { PACK, buildBoxNo } from "@/cst/pack";
import { connectToDatabase } from "@/lib/mongo";
import { PackBoxV1, PackBoxItem } from "@/types/PackBoxV1";
import { writePackAudit } from "./audit";
import { nextBoxSeq } from "./box-seq";
import {
  findOpenBoxByBoxNo,
  getClientById,
  getOutboundById,
} from "./getters";

const PACK_BOXES = collections.PACK_BOX_V1;
const OUTBOUNDS = collections.OUTBOUND;
const PACK_READY_STATUSES = ["picked", "packing"];

async function findInboundById(_id: string) {
  const db = await connectToDatabase();
  return db.collection(collections.INBOUND).findOne({ _id: _id as any });
}

async function ensureOutboundInPacking(staff: string, outbound_id: string) {
  const db = await connectToDatabase();
  const now = new Date();
  await db.collection(OUTBOUNDS).updateOne(
    { _id: outbound_id as any, status: "picked" },
    {
      $set: {
        status: "packing",
        updatedAt: now,
        updatedBy: staff,
      },
    }
  );
}

async function loadClientCode(client_id: string): Promise<string> {
  const c = await getClientById(client_id);
  return (
    c?.code ||
    c?.client_code ||
    String(client_id).slice(-4).toUpperCase()
  );
}

export async function openBox(
  staff: string,
  args: { inbound_id: string; outbound_id: string; from_box_no?: string | null }
): Promise<{ box: PackBoxV1; printPayload: any }> {
  const db = await connectToDatabase();
  const now = new Date();

  const inbound = await findInboundById(args.inbound_id);
  if (!inbound) {
    throw new ApiError("ITEM_NOT_FOUND", { trackingNo: args.inbound_id });
  }
  const outbound = await getOutboundById(args.outbound_id);
  if (!outbound) throw new ApiError("OUTBOUND_NOT_FOUND", { orderId: args.outbound_id });
  if (!PACK_READY_STATUSES.includes(outbound.status)) {
    throw new ApiError("ITEM_NOT_PACK_READY", {
      trackingNo: inbound.tracking_no,
    });
  }

  const client_id = String(outbound.client_id);
  const client_code = await loadClientCode(client_id);
  const seq = await nextBoxSeq(client_id);
  const box_no = buildBoxNo(client_code, seq);

  const isSingleDirect = outbound.shipment_type === "single";

  if (args.from_box_no) {
    const src = await findOpenBoxByBoxNo(args.from_box_no);
    if (src) {
      await db.collection(PACK_BOXES).updateOne(
        { _id: (src as any)._id },
        {
          $pull: { items: { inbound_id: args.inbound_id } } as any,
          $set: { updatedAt: now },
        }
      );
    }
  }

  const item: PackBoxItem = {
    inbound_id: args.inbound_id,
    outbound_id: args.outbound_id,
    tracking_no: inbound.tracking_no || "",
    placed_at: now,
    placed_by: staff,
  };

  const doc: any = {
    _id: `PBX-${Date.now()}-${seq}`,
    box_no,
    client_id,
    client_code,
    warehouse_code: outbound.warehouseCode || outbound.warehouse_code || "",
    status: PACK.STATUS.OPEN,
    is_single_direct: isSingleDirect,
    items: [item],
    max_slots: isSingleDirect ? PACK.SINGLE_DIRECT_MAX_SLOTS : PACK.DEFAULT_MAX_SLOTS,
    width: 0,
    length: 0,
    height: 0,
    weight: 0,
    opened_at: now,
    opened_by: staff,
    sealed_at: null,
    sealed_by: null,
    cancelled_at: null,
    cancelled_by: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection(PACK_BOXES).insertOne(doc);

  await ensureOutboundInPacking(staff, args.outbound_id);

  await writePackAudit(staff, "pack.open_box", {
    box_no,
    client_id,
    inbound_id: args.inbound_id,
    outbound_id: args.outbound_id,
    is_single_direct: isSingleDirect,
    from_box_no: args.from_box_no || null,
  });
  await writePackAudit(staff, "pack.print_box_label", { box_no });

  const client = await getClientById(client_id);
  const printPayload = {
    boxNo: box_no,
    clientCode: client_code,
    clientName:
      client?.company_name ||
      client?.company_info?.legal_name ||
      client?.display_name ||
      client?.email ||
      client_id,
    isSingleDirect: isSingleDirect,
    outboundId: args.outbound_id,
    trackingNo: item.tracking_no,
    openedAt: now,
  };

  return { box: doc, printPayload };
}

export async function placeItem(
  staff: string,
  args: {
    inbound_id: string;
    outbound_id: string;
    to_box_no: string;
    from_box_no?: string | null;
  }
): Promise<{ box: PackBoxV1 }> {
  const db = await connectToDatabase();
  const now = new Date();

  if (args.from_box_no && args.from_box_no === args.to_box_no) {
    throw new ApiError("PACK_SAME_BOX_NO_OP");
  }

  const inbound = await findInboundById(args.inbound_id);
  if (!inbound) {
    throw new ApiError("ITEM_NOT_FOUND", { trackingNo: args.inbound_id });
  }
  const outbound = await getOutboundById(args.outbound_id);
  if (!outbound) throw new ApiError("OUTBOUND_NOT_FOUND", { orderId: args.outbound_id });
  if (!PACK_READY_STATUSES.includes(outbound.status)) {
    throw new ApiError("ITEM_NOT_PACK_READY", {
      trackingNo: inbound.tracking_no,
    });
  }

  const dst = await findOpenBoxByBoxNo(args.to_box_no);
  if (!dst) throw new ApiError("PACK_BOX_NOT_FOUND", { boxNo: args.to_box_no });
  if (dst.status !== PACK.STATUS.OPEN) {
    throw new ApiError("PACK_BOX_NOT_OPEN", { boxNo: args.to_box_no });
  }
  if (String(dst.client_id) !== String(outbound.client_id)) {
    throw new ApiError("PACK_BOX_CLIENT_MISMATCH", { boxNo: args.to_box_no });
  }
  if (dst.is_single_direct) {
    throw new ApiError("PACK_SINGLE_DIRECT_NO_MIX");
  }
  if (outbound.shipment_type === "single") {
    throw new ApiError("PACK_SINGLE_DIRECT_NO_MIX");
  }
  if ((dst.items?.length || 0) >= (dst.max_slots || PACK.DEFAULT_MAX_SLOTS)) {
    throw new ApiError("PACK_BOX_FULL", { boxNo: args.to_box_no });
  }

  if (args.from_box_no) {
    const src = await findOpenBoxByBoxNo(args.from_box_no);
    if (src) {
      await db.collection(PACK_BOXES).updateOne(
        { _id: (src as any)._id },
        {
          $pull: { items: { inbound_id: args.inbound_id } } as any,
          $set: { updatedAt: now },
        }
      );
    }
  }

  const item: PackBoxItem = {
    inbound_id: args.inbound_id,
    outbound_id: args.outbound_id,
    tracking_no: inbound.tracking_no || "",
    placed_at: now,
    placed_by: staff,
  };
  await db.collection(PACK_BOXES).updateOne(
    { _id: (dst as any)._id },
    {
      $push: { items: item } as any,
      $set: { updatedAt: now },
    }
  );

  await ensureOutboundInPacking(staff, args.outbound_id);

  await writePackAudit(
    staff,
    args.from_box_no ? "pack.swap_item" : "pack.place_item",
    {
      box_no: args.to_box_no,
      from_box_no: args.from_box_no || null,
      inbound_id: args.inbound_id,
      outbound_id: args.outbound_id,
    }
  );

  const updated = (await db
    .collection(PACK_BOXES)
    .findOne({ _id: (dst as any)._id })) as unknown as PackBoxV1;
  return { box: updated };
}

export async function cancelBox(staff: string, box_no: string) {
  const db = await connectToDatabase();
  const now = new Date();

  const box = await findOpenBoxByBoxNo(box_no);
  if (!box) throw new ApiError("PACK_BOX_NOT_FOUND", { boxNo: box_no });

  const affectedOutbounds = Array.from(
    new Set((box.items || []).map((i) => i.outbound_id))
  );

  await db.collection(PACK_BOXES).updateOne(
    { _id: (box as any)._id },
    {
      $set: {
        status: PACK.STATUS.CANCELLED,
        items: [],
        cancelled_at: now,
        cancelled_by: staff,
        updatedAt: now,
      },
    }
  );

  for (const outbound_id of affectedOutbounds) {
    const stillBoxed = await db.collection(PACK_BOXES).findOne({
      status: { $in: [PACK.STATUS.OPEN, PACK.STATUS.SEALED] },
      "items.outbound_id": outbound_id,
    });
    if (!stillBoxed) {
      await db.collection(OUTBOUNDS).updateOne(
        { _id: outbound_id as any, status: "packing" },
        {
          $set: {
            status: "picked",
            updatedAt: now,
            updatedBy: staff,
          },
        }
      );
    }
  }

  await writePackAudit(staff, "pack.cancel_box", {
    box_no,
    item_count: box.items?.length || 0,
    affected_outbounds: affectedOutbounds,
  });

  return { box_no, status: PACK.STATUS.CANCELLED };
}

export async function sealBox(
  staff: string,
  box_no: string,
  dims?: { width?: number; length?: number; height?: number; weight?: number }
) {
  const db = await connectToDatabase();
  const now = new Date();

  const box = await findOpenBoxByBoxNo(box_no);
  if (!box) throw new ApiError("PACK_BOX_NOT_FOUND", { boxNo: box_no });
  if (!box.items || box.items.length === 0) {
    throw new ApiError("PACK_BOX_NOT_OPEN", { boxNo: box_no });
  }

  await db.collection(PACK_BOXES).updateOne(
    { _id: (box as any)._id },
    {
      $set: {
        status: PACK.STATUS.SEALED,
        sealed_at: now,
        sealed_by: staff,
        width: Number(dims?.width || box.width || 0),
        length: Number(dims?.length || box.length || 0),
        height: Number(dims?.height || box.height || 0),
        weight: Number(dims?.weight || box.weight || 0),
        updatedAt: now,
      },
    }
  );

  const affectedOutbounds = Array.from(
    new Set((box.items || []).map((i) => i.outbound_id))
  );
  for (const outbound_id of affectedOutbounds) {
    const outbound = await getOutboundById(outbound_id);
    if (!outbound) continue;
    const links = await db
      .collection(collections.OUTBOUND_INBOUND_LINK)
      .find({ outbound_id, unlinked_at: null })
      .toArray();
    const linkedInboundIds = links.map((l: any) => String(l.inbound_id));
    if (linkedInboundIds.length === 0) continue;

    const sealedHits = await db
      .collection(PACK_BOXES)
      .aggregate([
        { $match: { status: PACK.STATUS.SEALED } },
        { $unwind: "$items" },
        { $match: { "items.inbound_id": { $in: linkedInboundIds } } },
        { $group: { _id: "$items.inbound_id" } },
      ])
      .toArray();
    const sealedSet = new Set(sealedHits.map((h: any) => String(h._id)));
    const allSealed = linkedInboundIds.every((id) => sealedSet.has(id));

    if (allSealed) {
      await db.collection(OUTBOUNDS).updateOne(
        { _id: outbound_id as any },
        {
          $set: {
            status: "packed",
            updatedAt: now,
            updatedBy: staff,
          },
        }
      );
    }
  }

  await writePackAudit(staff, "pack.seal_box", {
    box_no,
    item_count: box.items?.length || 0,
    affected_outbounds: affectedOutbounds,
    dims: dims || null,
  });

  return { box_no, status: PACK.STATUS.SEALED };
}

/**
 * Complete the packing session: seal all currently-open boxes that have ≥1
 * item, cancel any open boxes that ended up empty. Returns per-box outcome.
 * Used by the desktop "完成裝箱" action to hand off to weigh + palletize.
 */
export async function completePackingSession(
  staff: string,
  warehouseCode?: string
) {
  const db = await connectToDatabase();
  const query: any = { status: PACK.STATUS.OPEN };
  if (warehouseCode) query.warehouse_code = warehouseCode;
  const openBoxes = (await db
    .collection(PACK_BOXES)
    .find(query)
    .toArray()) as unknown as PackBoxV1[];

  const sealed: string[] = [];
  const cancelled: string[] = [];

  for (const box of openBoxes) {
    if ((box.items?.length || 0) > 0) {
      try {
        await sealBox(staff, box.box_no);
        sealed.push(box.box_no);
      } catch (e) {
        // surface but continue — don't let one box block the session close
        console.error("completePackingSession: sealBox failed", box.box_no, e);
      }
    } else {
      try {
        await cancelBox(staff, box.box_no);
        cancelled.push(box.box_no);
      } catch (e) {
        console.error("completePackingSession: cancelBox failed", box.box_no, e);
      }
    }
  }

  await writePackAudit(staff, "pack.seal_box", {
    session_complete: true,
    sealed_count: sealed.length,
    cancelled_count: cancelled.length,
  });

  return { sealed, cancelled };
}

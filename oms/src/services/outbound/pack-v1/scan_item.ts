import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { PACK } from "@/cst/pack";
import { connectToDatabase } from "@/lib/mongo";
import { PackBoxV1 } from "@/types/PackBoxV1";
import {
  findInboundByTrackingOrId,
  findOpenBoxContainingInbound,
  getActiveLinkForInbound,
  getClientById,
  getOutboundById,
} from "./getters";

const PACK_READY_STATUSES = ["picked", "packing"];

export type ScanResult = {
  mode: "place" | "swap";
  item: {
    inbound_id: string;
    outbound_id: string;
    tracking_no: string;
    product_name: string | null;
    shipment_type: "single" | "consolidated";
  };
  owner: {
    client_id: string;
    client_code: string;
    client_name: string;
    desk_count: number;
    related_outbounds: { outbound_id: string; inbound_count: number }[];
    open_boxes: PackBoxV1[];
  };
  from_box?: PackBoxV1;
};

export async function scanItem(scanCode: string): Promise<ScanResult> {
  const t = scanCode.trim();
  if (!t) {
    throw new ApiError("ITEM_NOT_FOUND", { trackingNo: scanCode });
  }

  const inbound = await findInboundByTrackingOrId(t);
  if (!inbound) throw new ApiError("ITEM_NOT_FOUND", { trackingNo: t });

  const link = await getActiveLinkForInbound(String(inbound._id));
  if (!link) {
    throw new ApiError("ITEM_NOT_PACK_READY", {
      trackingNo: inbound.tracking_no || t,
    });
  }
  const outbound = await getOutboundById(String(link.outbound_id));
  if (!outbound) {
    throw new ApiError("OUTBOUND_NOT_FOUND", { orderId: String(link.outbound_id) });
  }
  if (!PACK_READY_STATUSES.includes(outbound.status)) {
    throw new ApiError("ITEM_NOT_PACK_READY", {
      trackingNo: inbound.tracking_no || t,
    });
  }

  const fromOpen = await findOpenBoxContainingInbound(String(inbound._id));
  const mode: "place" | "swap" = fromOpen ? "swap" : "place";

  const client = await getClientById(String(outbound.client_id));
  const client_code =
    client?.code ||
    client?.client_code ||
    String(outbound.client_id).slice(-4).toUpperCase();
  const client_name =
    client?.company_name ||
    client?.company_info?.legal_name ||
    client?.display_name ||
    client?.email ||
    "—";

  const db = await connectToDatabase();
  const sameClientOutbounds = await db
    .collection(collections.OUTBOUND)
    .find({
      client_id: outbound.client_id,
      status: { $in: PACK_READY_STATUSES },
    })
    .project({ _id: 1, inbound_count: 1 })
    .toArray();

  const outboundIds = sameClientOutbounds.map((o) => String(o._id));
  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({ outbound_id: { $in: outboundIds }, unlinked_at: null })
    .toArray();
  const candidateInboundIds = new Set(
    links.map((l: any) => String(l.inbound_id))
  );
  const boxedInbounds = await db
    .collection(collections.PACK_BOX_V1)
    .find({
      status: { $in: [PACK.STATUS.OPEN, PACK.STATUS.SEALED] },
      "items.inbound_id": { $in: [...candidateInboundIds] },
    })
    .project({ "items.inbound_id": 1 })
    .toArray();
  for (const b of boxedInbounds) {
    for (const it of (b as any).items ?? []) {
      candidateInboundIds.delete(String(it.inbound_id));
    }
  }
  const desk_count = candidateInboundIds.size;

  const open_boxes = (await db
    .collection(collections.PACK_BOX_V1)
    .find({ client_id: outbound.client_id, status: PACK.STATUS.OPEN })
    .sort({ opened_at: 1 })
    .toArray()) as unknown as PackBoxV1[];

  return {
    mode,
    item: {
      inbound_id: String(inbound._id),
      outbound_id: String(outbound._id),
      tracking_no: inbound.tracking_no || t,
      product_name: inbound.product_name || null,
      shipment_type: outbound.shipment_type || "consolidated",
    },
    owner: {
      client_id: String(outbound.client_id),
      client_code,
      client_name,
      desk_count,
      related_outbounds: sameClientOutbounds.map((o: any) => ({
        outbound_id: String(o._id),
        inbound_count: o.inbound_count || 0,
      })),
      open_boxes,
    },
    from_box: fromOpen || undefined,
  };
}

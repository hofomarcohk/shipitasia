// Phase 9 — shipped (departed) outbound listing + detail aggregation.
//
// Pure read-only joins across:
//   outbound_requests (departed only, scoped by client_id)
//     ↳ outbound_boxes
//        ↳ box_inbound_links → inbound_requests → inbound_declared_items
//     ↳ carriers (for name_zh / logo / tracking_url_template)
//     ↳ warehouses (for sender block)
//
// v1 business volume is small (≤ 3000 docs/half-year per spec §0.2) so
// we don't bother with aggregation pipelines — straight finds + Map
// joins in app code are easier to reason about and fast enough.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

export interface ShippedListFilters {
  client_id: string;
  search?: string;
  country_codes?: string[];
  carrier_codes?: string[];
  departed_from?: Date;
  departed_to?: Date;
  sort_by?: "departed_at" | "createdAt" | "_id";
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface OutboundShippedListItem {
  _id: string;
  createdAt: Date;
  departed_at: Date | null;
  customer_remarks: string | null;
  carrier: {
    carrier_code: string;
    name_zh: string;
    name_en: string;
    logo_url: string | null;
    tracking_url_template: string | null;
  };
  service_code: string | null;
  sender: {
    contact_name: string | null;
    phone: string | null;
    address: string;
    country_code: string;
  };
  receiver: {
    name: string;
    phone: string;
    country_code: string;
    city: string;
    address: string;
    postal_code: string | null;
  };
  total_boxes: number;
  total_inbound_count: number;
  tracking_summary: {
    primary_tracking_no: string | null;
    additional_count: number;
  };
  actual_label_fee: number | null;
  first_box_preview: {
    box_no: string;
    dimensions: { length: number; width: number; height: number };
    weight_actual: number | null;
    first_item_name: string | null;
  } | null;
}

export async function listShippedOutbounds(
  filters: ShippedListFilters
): Promise<{
  items: OutboundShippedListItem[];
  pagination: { total: number; page: number; page_size: number; total_pages: number };
}> {
  const db = await connectToDatabase();
  const page = Math.max(1, filters.page ?? 1);
  const page_size = Math.min(50, Math.max(1, filters.page_size ?? 10));
  const sort_by = filters.sort_by ?? "departed_at";
  const sort_order = filters.sort_order ?? "desc";

  const baseFilter: Record<string, unknown> = {
    client_id: filters.client_id,
    status: "departed",
  };
  if (filters.country_codes && filters.country_codes.length > 0) {
    baseFilter["destination_country"] = { $in: filters.country_codes };
  }
  if (filters.carrier_codes && filters.carrier_codes.length > 0) {
    baseFilter["carrier_code"] = { $in: filters.carrier_codes };
  }
  if (filters.departed_from || filters.departed_to) {
    const range: any = {};
    if (filters.departed_from) range.$gte = filters.departed_from;
    if (filters.departed_to) range.$lte = filters.departed_to;
    baseFilter["departed_at"] = range;
  }
  // Search: regex across _id, receiver.name, and box.tracking_no_carrier.
  // For tracking we need a sub-query first to find matching outbound_ids.
  const orClauses: any[] = [];
  if (filters.search && filters.search.trim().length >= 2) {
    const escaped = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "i");
    orClauses.push({ _id: rx });
    orClauses.push({ "receiver_address.name": rx });
    const trackingMatches = await db
      .collection(collections.OUTBOUND_BOX)
      .find({ tracking_no_carrier: rx }, { projection: { outbound_id: 1 } })
      .toArray();
    if (trackingMatches.length > 0) {
      orClauses.push({
        _id: {
          $in: Array.from(
            new Set(trackingMatches.map((b: any) => b.outbound_id))
          ),
        },
      });
    }
    baseFilter["$or"] = orClauses;
  }

  const total = await db
    .collection(collections.OUTBOUND)
    .countDocuments(baseFilter);
  const docs = await db
    .collection(collections.OUTBOUND)
    .find(baseFilter)
    .sort({ [sort_by]: sort_order === "asc" ? 1 : -1 })
    .skip((page - 1) * page_size)
    .limit(page_size)
    .toArray();
  if (docs.length === 0) {
    return {
      items: [],
      pagination: { total, page, page_size, total_pages: Math.ceil(total / page_size) },
    };
  }

  const outboundIds = docs.map((d: any) => d._id);
  const carrierCodes = Array.from(
    new Set(docs.map((d: any) => d.carrier_code).filter(Boolean))
  );
  const warehouseCodes = Array.from(
    new Set(docs.map((d: any) => d.warehouseCode).filter(Boolean))
  );

  const [carriers, warehouses, boxes] = await Promise.all([
    db.collection(collections.CARRIER).find({ carrier_code: { $in: carrierCodes } }).toArray(),
    db.collection(collections.WAREHOUSE).find({ warehouseCode: { $in: warehouseCodes } }).toArray(),
    db
      .collection(collections.OUTBOUND_BOX)
      .find({ outbound_id: { $in: outboundIds } })
      .sort({ box_no: 1 })
      .toArray(),
  ]);
  const carrierMap = new Map(carriers.map((c: any) => [c.carrier_code, c]));
  const warehouseMap = new Map(
    warehouses.map((w: any) => [w.warehouseCode, w])
  );
  const boxesByOutbound = new Map<string, any[]>();
  for (const b of boxes) {
    const arr = boxesByOutbound.get(b.outbound_id) ?? [];
    arr.push(b);
    boxesByOutbound.set(b.outbound_id, arr);
  }

  // For first-box preview, fetch the first declared item per first box.
  // Cheap because v1 ≤ 50 per page.
  const firstBoxes = docs
    .map((d: any) => (boxesByOutbound.get(d._id) ?? [])[0])
    .filter(Boolean);
  const firstBoxIds = firstBoxes.map((b: any) => String(b._id));
  const firstBoxLinks = await db
    .collection(collections.BOX_INBOUND_LINK)
    .find({ box_id: { $in: firstBoxIds }, unlinked_at: null })
    .toArray();
  const firstInboundIds = Array.from(
    new Set(firstBoxLinks.map((l: any) => l.inbound_id))
  );
  const firstItems = await db
    .collection(collections.INBOUND_DECLARED_ITEM)
    .find({ inbound_id: { $in: firstInboundIds } })
    .sort({ display_order: 1 })
    .toArray();
  const firstItemByInbound = new Map<string, any>();
  for (const it of firstItems) {
    if (!firstItemByInbound.has(it.inbound_id)) {
      firstItemByInbound.set(it.inbound_id, it);
    }
  }
  const firstLinkByBox = new Map<string, any>();
  for (const l of firstBoxLinks) {
    if (!firstLinkByBox.has(l.box_id)) firstLinkByBox.set(l.box_id, l);
  }

  // Compute total inbound count per outbound from active outbound_inbound_links.
  const linkCounts = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .aggregate([
      { $match: { outbound_id: { $in: outboundIds }, unlinked_at: null } },
      { $group: { _id: "$outbound_id", count: { $sum: 1 } } },
    ])
    .toArray();
  const inboundCountMap = new Map(
    linkCounts.map((r: any) => [r._id, r.count])
  );

  const items: OutboundShippedListItem[] = docs.map((d: any) => {
    const c = carrierMap.get(d.carrier_code);
    const w = warehouseMap.get(d.warehouseCode);
    const obBoxes = boxesByOutbound.get(d._id) ?? [];
    const tnos = obBoxes
      .map((b: any) => b.tracking_no_carrier)
      .filter(Boolean);
    const firstBox = obBoxes[0] ?? null;
    const firstLink = firstBox ? firstLinkByBox.get(String(firstBox._id)) : null;
    const firstItem = firstLink ? firstItemByInbound.get(firstLink.inbound_id) : null;

    const receiver = d.receiver_address ?? {};
    return {
      _id: String(d._id),
      createdAt: d.createdAt,
      departed_at: d.departed_at ?? null,
      customer_remarks: d.customer_remarks ?? null,
      carrier: {
        carrier_code: d.carrier_code,
        name_zh: c?.name_zh ?? d.carrier_code,
        name_en: c?.name_en ?? d.carrier_code,
        logo_url: c?.logo_url ?? null,
        tracking_url_template: c?.tracking_url_template ?? null,
      },
      service_code: d.service_code ?? null,
      sender: {
        contact_name: w?.name_zh ?? w?.name_en ?? null,
        phone: w?.contact_phone ?? null,
        address: w?.address_zh ?? w?.address_en ?? "",
        country_code: w?.country_code ?? "",
      },
      receiver: {
        name: receiver.name ?? "",
        phone: receiver.phone ?? "",
        country_code: receiver.country_code ?? "",
        city: receiver.city ?? "",
        address: receiver.address ?? "",
        postal_code: receiver.postal_code ?? null,
      },
      total_boxes: obBoxes.length,
      total_inbound_count: inboundCountMap.get(d._id) ?? 0,
      tracking_summary: {
        primary_tracking_no: tnos[0] ?? null,
        additional_count: Math.max(0, tnos.length - 1),
      },
      actual_label_fee: d.actual_label_fee ?? d.quoted_amount_hkd ?? null,
      first_box_preview: firstBox
        ? {
            box_no: firstBox.box_no,
            dimensions: firstBox.dimensions,
            weight_actual: firstBox.weight_actual ?? null,
            first_item_name: firstItem?.product_name ?? null,
          }
        : null,
    };
  });

  return {
    items,
    pagination: {
      total,
      page,
      page_size,
      total_pages: Math.max(1, Math.ceil(total / page_size)),
    },
  };
}

// ── detail (full join) ───────────────────────────────────────

export interface OutboundShippedDetail extends OutboundShippedListItem {
  processing_preference: "auto" | "confirm_before_label";
  boxes: Array<{
    _id: string;
    box_no: string;
    dimensions: { length: number; width: number; height: number };
    weight_actual: number | null;
    tracking_no_carrier: string | null;
    inbound_items: Array<{
      inbound_id: string;
      tracking_no: string;
      declared_items: Array<{
        product_name: string;
        quantity: number;
        unit_price: number;
        currency: string;
        subtotal: number;
      }>;
    }>;
  }>;
}

export async function getShippedDetail(
  client_id: string,
  outbound_id: string
): Promise<OutboundShippedDetail> {
  const db = await connectToDatabase();
  const ob = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any, client_id });
  if (!ob) {
    throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outbound_id });
  }
  // Reuse the list payload structure for the head fields.
  const listed = await listShippedOutbounds({
    client_id,
    // Tight filter so we get exactly this one item back.
    search: outbound_id,
    page: 1,
    page_size: 1,
  });
  let head = listed.items[0];
  if (!head) {
    // Fallback: status may not be `departed` (race / pre-departure peek).
    // Re-run a lightweight list with no status filter would be cleaner;
    // for v1 we synthesize the head manually.
    head = await synthesizeNonShippedHead(db, ob);
  }

  const boxes = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id })
    .sort({ box_no: 1 })
    .toArray();
  const boxIds = boxes.map((b: any) => String(b._id));
  const links = await db
    .collection(collections.BOX_INBOUND_LINK)
    .find({ box_id: { $in: boxIds }, unlinked_at: null })
    .toArray();
  const inboundIds = Array.from(new Set(links.map((l: any) => l.inbound_id)));
  const inbounds = await db
    .collection(collections.INBOUND)
    .find({ _id: { $in: inboundIds as any } })
    .toArray();
  const items = await db
    .collection(collections.INBOUND_DECLARED_ITEM)
    .find({ inbound_id: { $in: inboundIds } })
    .sort({ display_order: 1 })
    .toArray();
  const itemsByInbound = new Map<string, any[]>();
  for (const it of items) {
    const arr = itemsByInbound.get(it.inbound_id) ?? [];
    arr.push(it);
    itemsByInbound.set(it.inbound_id, arr);
  }
  const inboundById = new Map(inbounds.map((i: any) => [String(i._id), i]));
  const linksByBox = new Map<string, any[]>();
  for (const l of links) {
    const arr = linksByBox.get(l.box_id) ?? [];
    arr.push(l);
    linksByBox.set(l.box_id, arr);
  }

  return {
    ...head,
    processing_preference: ob.processing_preference,
    boxes: boxes.map((b: any) => {
      const blinks = linksByBox.get(String(b._id)) ?? [];
      return {
        _id: String(b._id),
        box_no: b.box_no,
        dimensions: b.dimensions,
        weight_actual: b.weight_actual ?? null,
        tracking_no_carrier: b.tracking_no_carrier ?? null,
        inbound_items: blinks.map((l: any) => {
          const inb = inboundById.get(l.inbound_id);
          const declared = (itemsByInbound.get(l.inbound_id) ?? []).map(
            (it: any) => ({
              product_name: it.product_name,
              quantity: it.quantity,
              unit_price: it.unit_price,
              currency: it.currency ?? "JPY",
              subtotal: it.subtotal,
            })
          );
          return {
            inbound_id: l.inbound_id,
            tracking_no: inb?.tracking_no ?? "",
            declared_items: declared,
          };
        }),
      };
    }),
  };
}

async function synthesizeNonShippedHead(
  db: any,
  ob: any
): Promise<OutboundShippedListItem> {
  const c = await db
    .collection(collections.CARRIER)
    .findOne({ carrier_code: ob.carrier_code });
  const w = await db
    .collection(collections.WAREHOUSE)
    .findOne({ warehouseCode: ob.warehouseCode });
  const obBoxes = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id: ob._id })
    .sort({ box_no: 1 })
    .toArray();
  const tnos = obBoxes
    .map((b: any) => b.tracking_no_carrier)
    .filter(Boolean);
  const receiver = ob.receiver_address ?? {};
  return {
    _id: String(ob._id),
    createdAt: ob.createdAt,
    departed_at: ob.departed_at ?? null,
    customer_remarks: ob.customer_remarks ?? null,
    carrier: {
      carrier_code: ob.carrier_code,
      name_zh: c?.name_zh ?? ob.carrier_code,
      name_en: c?.name_en ?? ob.carrier_code,
      logo_url: c?.logo_url ?? null,
      tracking_url_template: c?.tracking_url_template ?? null,
    },
    service_code: ob.service_code ?? null,
    sender: {
      contact_name: w?.name_zh ?? w?.name_en ?? null,
      phone: w?.contact_phone ?? null,
      address: w?.address_zh ?? w?.address_en ?? "",
      country_code: w?.country_code ?? "",
    },
    receiver: {
      name: receiver.name ?? "",
      phone: receiver.phone ?? "",
      country_code: receiver.country_code ?? "",
      city: receiver.city ?? "",
      address: receiver.address ?? "",
      postal_code: receiver.postal_code ?? null,
    },
    total_boxes: obBoxes.length,
    total_inbound_count: 0,
    tracking_summary: {
      primary_tracking_no: tnos[0] ?? null,
      additional_count: Math.max(0, tnos.length - 1),
    },
    actual_label_fee: ob.actual_label_fee ?? ob.quoted_amount_hkd ?? null,
    first_box_preview: null,
  };
}

// Commercial invoice / packing list payload builder for an outbound.
// Reads outbound + linked inbounds + declared items + warehouse and returns
// a flat structure the print page can render without further DB calls.

import { connectToDatabase } from "@/lib/mongo";
import { collections } from "@/cst/collections";
import { ApiError } from "@/app/api/api-error";

export interface InvoiceItem {
  product_name: string;
  category_name: string | null;
  subcategory_name: string | null;
  quantity: number;
  unit_price: number;
  currency: string;
  subtotal: number;
  source_inbound_id: string;
}

export interface InvoicePayload {
  outbound: {
    _id: string;
    carrier_code: string;
    tracking_no: string | null;
    destination_country: string;
    shipment_type: string;
    actual_weight_kg: number | null;
    declared_weight_kg: number | null;
    box_count: number;
    createdAt: string;
    label_obtained_at: string | null;
  };
  sender: {
    name: string;
    address: string;
    phone: string;
    country_code: string;
    postal_code: string;
  };
  receiver: {
    name: string;
    phone: string;
    country_code: string;
    city: string;
    district: string | null;
    address: string;
    postal_code: string | null;
  };
  inbound_ids: string[];
  items: InvoiceItem[];
  totals: {
    items_count: number;
    total_quantity: number;
    grand_total: number;
    currency: string;
  };
}

export async function getOutboundInvoiceData(
  outbound_id: string
): Promise<InvoicePayload> {
  const db = await connectToDatabase();

  const ob: any = await db
    .collection(collections.OUTBOUND)
    .findOne({ _id: outbound_id as any });
  if (!ob) throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outbound_id });

  const warehouse: any = await db
    .collection(collections.WAREHOUSE)
    .findOne({ warehouseCode: ob.warehouseCode });

  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({ outbound_id, unlinked_at: null })
    .toArray();
  const inbound_ids = links.map((l: any) => l.inbound_id);

  const itemsRaw = inbound_ids.length
    ? await db
        .collection(collections.INBOUND_DECLARED_ITEM)
        .find({
          $or: [
            { inbound_request_id: { $in: inbound_ids } },
            { inbound_id: { $in: inbound_ids } },
          ],
        })
        .sort({ display_order: 1 })
        .toArray()
    : [];

  // Resolve category names in one fetch.
  const catIds = Array.from(
    new Set(
      itemsRaw.flatMap((it: any) =>
        [it.category_id, it.subcategory_id].filter(Boolean)
      )
    )
  );
  const cats = catIds.length
    ? await db
        .collection(collections.PRODUCT_CATEGORY)
        .find({ _id: { $in: catIds as any } })
        .toArray()
    : [];
  const catName = new Map<string, string>();
  for (const c of cats as any[]) {
    catName.set(String(c._id), c.name_zh || c.name_en || String(c._id));
  }

  const boxCount = await db
    .collection(collections.OUTBOUND_BOX)
    .countDocuments({ outbound_id });

  const items: InvoiceItem[] = itemsRaw.map((it: any) => ({
    product_name: it.product_name,
    category_name: catName.get(it.category_id) ?? null,
    subcategory_name: catName.get(it.subcategory_id) ?? null,
    quantity: it.quantity,
    unit_price: it.unit_price,
    currency: it.currency ?? "JPY",
    subtotal: it.subtotal ?? it.quantity * it.unit_price,
    source_inbound_id: String(it.inbound_request_id ?? it.inbound_id ?? ""),
  }));

  const total_quantity = items.reduce((s, it) => s + it.quantity, 0);
  const grand_total = items.reduce((s, it) => s + it.subtotal, 0);

  return {
    outbound: {
      _id: ob._id,
      carrier_code: ob.carrier_code,
      tracking_no: ob.tracking_no ?? null,
      destination_country: ob.destination_country,
      shipment_type: ob.shipment_type,
      actual_weight_kg: ob.actual_weight_kg ?? null,
      declared_weight_kg: ob.declared_weight_kg ?? null,
      box_count: boxCount,
      createdAt:
        ob.createdAt instanceof Date
          ? ob.createdAt.toISOString()
          : String(ob.createdAt),
      label_obtained_at: ob.label_obtained_at
        ? ob.label_obtained_at instanceof Date
          ? ob.label_obtained_at.toISOString()
          : String(ob.label_obtained_at)
        : null,
    },
    sender: {
      name: warehouse?.name_zh ?? warehouse?.name_en ?? ob.warehouseCode,
      address: warehouse?.address_zh ?? warehouse?.address_en ?? "",
      phone: warehouse?.contact_phone ?? "",
      country_code: warehouse?.country_code ?? "",
      postal_code: warehouse?.postal_code ?? "",
    },
    receiver: {
      name: ob.receiver_address?.name ?? "",
      phone: ob.receiver_address?.phone ?? "",
      country_code: ob.receiver_address?.country_code ?? ob.destination_country,
      city: ob.receiver_address?.city ?? "",
      district: ob.receiver_address?.district ?? null,
      address: ob.receiver_address?.address ?? "",
      postal_code: ob.receiver_address?.postal_code ?? null,
    },
    inbound_ids,
    items,
    totals: {
      items_count: items.length,
      total_quantity,
      grand_total,
      currency: items[0]?.currency ?? warehouse?.declared_currency ?? "JPY",
    },
  };
}

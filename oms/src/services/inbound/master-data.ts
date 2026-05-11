import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

// ── warehouses ─────────────────────────────────────────────

export interface WarehousePublic {
  warehouseCode: string;
  name_zh: string;
  name_en: string;
  country_code: string;
  declared_currency: string;
  address_zh: string;
  address_en: string;
  postal_code: string;
  contact_phone: string;
}

export async function listActiveWarehouses(): Promise<WarehousePublic[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.WAREHOUSE)
    .find({ status: "active" })
    .toArray();
  return docs.map((w: any) => ({
    warehouseCode: w.warehouseCode,
    name_zh: w.name_zh,
    name_en: w.name_en ?? w.warehouseCode,
    country_code: w.country_code ?? "JP",
    declared_currency: w.declared_currency ?? "JPY",
    address_zh: w.address_zh ?? "",
    address_en: w.address_en ?? "",
    postal_code: w.postal_code ?? "",
    contact_phone: w.contact_phone ?? "",
  }));
}

// ── carriers_inbound ───────────────────────────────────────

export interface CarrierInboundPublic {
  carrier_inbound_code: string;
  name_zh: string;
  name_en: string;
  name_ja: string | null;
  tracking_format_hint: string | null;
  tracking_url_template: string | null;
  sort_order: number;
}

export async function listActiveCarriersInbound(): Promise<CarrierInboundPublic[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.CARRIER_INBOUND)
    .find({ status: "active" })
    .sort({ sort_order: 1, carrier_inbound_code: 1 })
    .toArray();
  return docs.map((c: any) => ({
    carrier_inbound_code: c.carrier_inbound_code,
    name_zh: c.name_zh,
    name_en: c.name_en,
    name_ja: c.name_ja ?? null,
    tracking_format_hint: c.tracking_format_hint ?? null,
    tracking_url_template: c.tracking_url_template ?? null,
    sort_order: c.sort_order ?? 100,
  }));
}

// ── product_categories (tree) ──────────────────────────────

export interface CategoryNode {
  _id: string;
  name_zh: string;
  name_en: string;
  sort_order: number;
  subcategories: {
    _id: string;
    name_zh: string;
    name_en: string;
    sort_order: number;
  }[];
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const db = await connectToDatabase();
  const all = await db
    .collection(collections.PRODUCT_CATEGORY)
    .find({ status: "active" })
    .sort({ sort_order: 1 })
    .toArray();
  const byParent: Record<string, any[]> = {};
  const roots: any[] = [];
  for (const c of all) {
    if (c.parent_id == null) {
      roots.push(c);
    } else {
      (byParent[c.parent_id] ??= []).push(c);
    }
  }
  return roots.map((r: any) => ({
    _id: r._id,
    name_zh: r.name_zh,
    name_en: r.name_en ?? "",
    sort_order: r.sort_order ?? 100,
    subcategories: (byParent[r._id] ?? []).map((s: any) => ({
      _id: s._id,
      name_zh: s.name_zh,
      name_en: s.name_en ?? "",
      sort_order: s.sort_order ?? 100,
    })),
  }));
}

export async function validateCategoryPair(
  category_id: string,
  subcategory_id: string
): Promise<boolean> {
  const db = await connectToDatabase();
  const sub = await db
    .collection(collections.PRODUCT_CATEGORY)
    .findOne({ _id: subcategory_id as any });
  if (!sub) return false;
  return sub.parent_id === category_id;
}

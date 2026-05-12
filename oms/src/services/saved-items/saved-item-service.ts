// P10 — client-managed saved item library. Per-customer template store
// for declared items picked at inbound time so the customer skips
// re-typing category / subcategory / product_name / product_url for
// frequently-shipped SKUs.
//
// Client-scoped CRUD; admins read the same data via the audit log if
// needed. All mutations enforce that the doc's client_id matches the
// caller before writing.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { ObjectId } from "mongodb";
import { z } from "zod";

export const SavedItemInputSchema = z
  .object({
    category_id: z.string().min(1),
    subcategory_id: z.string().min(1),
    product_name: z.string().min(1).max(200).trim(),
    product_url: z.string().max(500).optional(),
    default_quantity: z.number().int().min(1).default(1),
    default_unit_price: z.number().min(0).default(0),
  })
  .strict();
export type SavedItemInput = z.infer<typeof SavedItemInputSchema>;

export interface SavedItemPublic {
  _id: string;
  category_id: string;
  subcategory_id: string;
  product_name: string;
  product_url: string | null;
  default_quantity: number;
  default_unit_price: number;
  used_count: number;
  last_used_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function project(doc: any): SavedItemPublic {
  return {
    _id: String(doc._id),
    category_id: doc.category_id,
    subcategory_id: doc.subcategory_id,
    product_name: doc.product_name,
    product_url: doc.product_url ?? null,
    default_quantity: doc.default_quantity ?? 1,
    default_unit_price: doc.default_unit_price ?? 0,
    used_count: doc.used_count ?? 0,
    last_used_at: doc.last_used_at ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface ListSavedItemsParams {
  search?: string;
  category_id?: string;
  sort?: "recent" | "used" | "name";
}

export async function listSavedItems(
  client_id: string,
  params: ListSavedItemsParams = {}
): Promise<SavedItemPublic[]> {
  const db = await connectToDatabase();
  const query: any = { client_id };
  if (params.category_id) query.category_id = params.category_id;
  if (params.search) {
    // Substring fallback over $text — text index needs whitespace-tokenised
    // input which doesn't suit CJK product names.
    const safe = params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.product_name = { $regex: safe, $options: "i" };
  }

  const sortMap: Record<string, any> = {
    recent: { last_used_at: -1, createdAt: -1 },
    used: { used_count: -1, last_used_at: -1 },
    name: { product_name: 1 },
  };
  const sort = sortMap[params.sort ?? "recent"];

  const docs = await db
    .collection(collections.SAVED_ITEM)
    .find(query)
    .sort(sort)
    .limit(500)
    .toArray();
  return docs.map(project);
}

export async function createSavedItem(
  client_id: string,
  raw: unknown
): Promise<SavedItemPublic> {
  const input = SavedItemInputSchema.parse(raw);
  const db = await connectToDatabase();
  const now = new Date();
  const ins = await db.collection(collections.SAVED_ITEM).insertOne({
    client_id,
    category_id: input.category_id,
    subcategory_id: input.subcategory_id,
    product_name: input.product_name,
    product_url: input.product_url ?? null,
    default_quantity: input.default_quantity,
    default_unit_price: input.default_unit_price,
    used_count: 0,
    last_used_at: null,
    createdAt: now,
    updatedAt: now,
  } as any);
  const created = await db
    .collection(collections.SAVED_ITEM)
    .findOne({ _id: ins.insertedId });
  return project(created);
}

export async function updateSavedItem(
  client_id: string,
  id: string,
  raw: unknown
): Promise<SavedItemPublic> {
  const input = SavedItemInputSchema.partial().parse(raw);
  const db = await connectToDatabase();
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    throw new ApiError("SAVED_ITEM_NOT_FOUND");
  }
  const existing = await db
    .collection(collections.SAVED_ITEM)
    .findOne({ _id: oid, client_id });
  if (!existing) throw new ApiError("SAVED_ITEM_NOT_FOUND");

  await db.collection(collections.SAVED_ITEM).updateOne(
    { _id: oid, client_id },
    {
      $set: {
        ...input,
        updatedAt: new Date(),
      },
    }
  );
  const after = await db
    .collection(collections.SAVED_ITEM)
    .findOne({ _id: oid });
  return project(after);
}

export async function deleteSavedItem(
  client_id: string,
  id: string
): Promise<void> {
  const db = await connectToDatabase();
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    throw new ApiError("SAVED_ITEM_NOT_FOUND");
  }
  const r = await db
    .collection(collections.SAVED_ITEM)
    .deleteOne({ _id: oid, client_id });
  if (r.deletedCount === 0) throw new ApiError("SAVED_ITEM_NOT_FOUND");
}

export async function deleteSavedItemsBulk(
  client_id: string,
  ids: string[]
): Promise<number> {
  if (!ids.length) return 0;
  const db = await connectToDatabase();
  const oids: ObjectId[] = [];
  for (const id of ids) {
    try {
      oids.push(new ObjectId(id));
    } catch {
      // skip malformed IDs silently — the response count will reflect.
    }
  }
  if (!oids.length) return 0;
  const r = await db
    .collection(collections.SAVED_ITEM)
    .deleteMany({ _id: { $in: oids }, client_id });
  return r.deletedCount ?? 0;
}

/**
 * Called from the inbound submit path with the saved-item IDs that were
 * actually picked / matched. Bumps used_count + last_used_at so the list
 * can sort by frequency for power users. Silent on missing IDs.
 */
export async function markSavedItemsUsed(
  client_id: string,
  ids: string[]
): Promise<void> {
  if (!ids.length) return;
  const db = await connectToDatabase();
  const oids: ObjectId[] = [];
  for (const id of ids) {
    try {
      oids.push(new ObjectId(id));
    } catch {
      // ignore malformed
    }
  }
  if (!oids.length) return;
  const now = new Date();
  await db.collection(collections.SAVED_ITEM).updateMany(
    { _id: { $in: oids }, client_id },
    {
      $inc: { used_count: 1 },
      $set: { last_used_at: now, updatedAt: now },
    }
  );
}

/**
 * Used by the inbound form's `⟲ sync` action — pushes the current row's
 * quantity + unit_price back to the library entry as the new defaults.
 */
export async function syncSavedItemDefaults(
  client_id: string,
  id: string,
  defaults: { default_quantity: number; default_unit_price: number }
): Promise<SavedItemPublic> {
  const db = await connectToDatabase();
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    throw new ApiError("SAVED_ITEM_NOT_FOUND");
  }
  const existing = await db
    .collection(collections.SAVED_ITEM)
    .findOne({ _id: oid, client_id });
  if (!existing) throw new ApiError("SAVED_ITEM_NOT_FOUND");

  await db.collection(collections.SAVED_ITEM).updateOne(
    { _id: oid, client_id },
    {
      $set: {
        default_quantity: Math.max(1, Math.floor(defaults.default_quantity)),
        default_unit_price: Math.max(0, defaults.default_unit_price),
        updatedAt: new Date(),
      },
    }
  );
  const after = await db
    .collection(collections.SAVED_ITEM)
    .findOne({ _id: oid });
  return project(after);
}

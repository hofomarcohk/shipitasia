// Bugfix wave 3 — client-managed saved address book.
//
// Client-scoped CRUD; no admin entry points (admins read the same data
// via the audit log if needed). All operations enforce that the doc's
// client_id matches the caller before mutating.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { ObjectId } from "mongodb";
import { z } from "zod";

export const SavedAddressInputSchema = z
  .object({
    label: z.string().min(1).max(50).trim(),
    name: z.string().min(1).max(100).trim(),
    phone: z.string().min(1).max(40).trim(),
    country_code: z.string().length(2),
    city: z.string().min(1).trim(),
    district: z.string().max(100).optional(),
    address: z.string().min(1).trim(),
    postal_code: z.string().max(20).optional(),
    is_default: z.boolean().optional(),
  })
  .strict();
export type SavedAddressInput = z.infer<typeof SavedAddressInputSchema>;

export interface SavedAddressPublic {
  _id: string;
  label: string;
  name: string;
  phone: string;
  country_code: string;
  city: string;
  district: string | null;
  address: string;
  postal_code: string | null;
  is_default: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function project(doc: any): SavedAddressPublic {
  return {
    _id: String(doc._id),
    label: doc.label,
    name: doc.name,
    phone: doc.phone,
    country_code: doc.country_code,
    city: doc.city,
    district: doc.district ?? null,
    address: doc.address,
    postal_code: doc.postal_code ?? null,
    is_default: !!doc.is_default,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listSavedAddresses(
  client_id: string
): Promise<SavedAddressPublic[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.SAVED_ADDRESS)
    .find({ client_id })
    .sort({ is_default: -1, createdAt: -1 })
    .toArray();
  return docs.map(project);
}

export async function createSavedAddress(
  client_id: string,
  raw: unknown
): Promise<SavedAddressPublic> {
  const input = SavedAddressInputSchema.parse(raw);
  const db = await connectToDatabase();
  // Label is unique per client (partial index). Pre-check for a friendly
  // error before the duplicate-key path.
  const dup = await db
    .collection(collections.SAVED_ADDRESS)
    .findOne({ client_id, label: input.label });
  if (dup) throw new ApiError("SAVED_ADDRESS_LABEL_DUP");

  const now = new Date();
  // If marking this one default, clear any existing default first.
  if (input.is_default) {
    await db
      .collection(collections.SAVED_ADDRESS)
      .updateMany(
        { client_id, is_default: true },
        { $set: { is_default: false, updatedAt: now } }
      );
  }
  const ins = await db.collection(collections.SAVED_ADDRESS).insertOne({
    client_id,
    label: input.label,
    name: input.name,
    phone: input.phone,
    country_code: input.country_code,
    city: input.city,
    district: input.district ?? null,
    address: input.address,
    postal_code: input.postal_code ?? null,
    is_default: !!input.is_default,
    createdAt: now,
    updatedAt: now,
  } as any);
  const created = await db
    .collection(collections.SAVED_ADDRESS)
    .findOne({ _id: ins.insertedId });
  return project(created);
}

export async function updateSavedAddress(
  client_id: string,
  id: string,
  raw: unknown
): Promise<SavedAddressPublic> {
  const input = SavedAddressInputSchema.partial().parse(raw);
  const db = await connectToDatabase();
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    throw new ApiError("SAVED_ADDRESS_NOT_FOUND");
  }
  const existing = await db
    .collection(collections.SAVED_ADDRESS)
    .findOne({ _id: oid, client_id });
  if (!existing) throw new ApiError("SAVED_ADDRESS_NOT_FOUND");

  const now = new Date();
  if (input.is_default === true) {
    await db
      .collection(collections.SAVED_ADDRESS)
      .updateMany(
        { client_id, is_default: true, _id: { $ne: oid } },
        { $set: { is_default: false, updatedAt: now } }
      );
  }
  if (input.label && input.label !== existing.label) {
    const dup = await db
      .collection(collections.SAVED_ADDRESS)
      .findOne({ client_id, label: input.label, _id: { $ne: oid } });
    if (dup) throw new ApiError("SAVED_ADDRESS_LABEL_DUP");
  }

  await db.collection(collections.SAVED_ADDRESS).updateOne(
    { _id: oid, client_id },
    {
      $set: {
        ...input,
        updatedAt: now,
      },
    }
  );
  const after = await db
    .collection(collections.SAVED_ADDRESS)
    .findOne({ _id: oid });
  return project(after);
}

export async function deleteSavedAddress(
  client_id: string,
  id: string
): Promise<void> {
  const db = await connectToDatabase();
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    throw new ApiError("SAVED_ADDRESS_NOT_FOUND");
  }
  const r = await db
    .collection(collections.SAVED_ADDRESS)
    .deleteOne({ _id: oid, client_id });
  if (r.deletedCount === 0) throw new ApiError("SAVED_ADDRESS_NOT_FOUND");
}

/**
 * Upsert-by-content helper called from inbound / outbound submit paths when
 * the client ticks "save this address". If an exact-content match exists
 * (same name + phone + address) we no-op; otherwise we insert with a label
 * auto-derived from the receiver name + city + a timestamp suffix to
 * avoid label collisions.
 */
export async function upsertFromShipping(
  client_id: string,
  shipping: {
    name: string;
    phone: string;
    country_code: string;
    city: string;
    district?: string;
    address: string;
    postal_code?: string;
  }
): Promise<{ saved: boolean; address_id: string | null }> {
  const db = await connectToDatabase();
  const existing = await db.collection(collections.SAVED_ADDRESS).findOne({
    client_id,
    name: shipping.name,
    phone: shipping.phone,
    address: shipping.address,
  });
  if (existing) {
    return { saved: false, address_id: String(existing._id) };
  }
  // Find a non-colliding label.
  let label = `${shipping.name} · ${shipping.city}`;
  let suffix = 0;
  while (
    await db
      .collection(collections.SAVED_ADDRESS)
      .findOne({ client_id, label })
  ) {
    suffix += 1;
    label = `${shipping.name} · ${shipping.city} (${suffix})`;
    if (suffix > 50) {
      // give up auto-naming; caller will get a stable but ugly label
      label = `${shipping.name} · ${shipping.city} · ${Date.now()}`;
      break;
    }
  }
  const now = new Date();
  const ins = await db.collection(collections.SAVED_ADDRESS).insertOne({
    client_id,
    label,
    name: shipping.name,
    phone: shipping.phone,
    country_code: shipping.country_code,
    city: shipping.city,
    district: shipping.district ?? null,
    address: shipping.address,
    postal_code: shipping.postal_code ?? null,
    is_default: false,
    createdAt: now,
    updatedAt: now,
  } as any);
  return { saved: true, address_id: String(ins.insertedId) };
}

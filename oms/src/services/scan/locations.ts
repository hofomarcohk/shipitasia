import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

export interface LocationPublic {
  warehouseCode: string;
  locationCode: string;
  zone: string;
  status: "active" | "disabled";
}

export async function listLocations(
  warehouseCode?: string
): Promise<LocationPublic[]> {
  const db = await connectToDatabase();
  const filter: any = { status: "active" };
  if (warehouseCode) filter.warehouseCode = warehouseCode;
  const docs = await db
    .collection(collections.LOCATION)
    .find(filter)
    .sort({ warehouseCode: 1, display_order: 1 })
    .toArray();
  return docs.map((d: any) => ({
    warehouseCode: d.warehouseCode,
    locationCode: d.locationCode,
    zone: d.zone ?? "storage",
    status: d.status,
  }));
}

export async function getLocation(
  warehouseCode: string,
  locationCode: string
) {
  const db = await connectToDatabase();
  const doc = await db
    .collection(collections.LOCATION)
    .findOne({ warehouseCode, locationCode });
  if (!doc) throw new ApiError("LOCATION_NOT_FOUND");
  return doc;
}

// ── Admin CRUD ───────────────────────────────────────────────

export interface AdminLocationInput {
  warehouseCode: string;
  locationCode: string;
  zone?: string;
  display_order?: number;
  note?: string;
}

export async function adminListLocations(
  warehouseCode?: string,
  options: { include_disabled?: boolean } = {}
) {
  const db = await connectToDatabase();
  const filter: any = {};
  if (warehouseCode) filter.warehouseCode = warehouseCode;
  if (!options.include_disabled) filter.status = "active";
  const docs = await db
    .collection(collections.LOCATION)
    .find(filter)
    .sort({ warehouseCode: 1, display_order: 1, locationCode: 1 })
    .toArray();
  return docs.map((d: any) => ({
    warehouseCode: d.warehouseCode,
    locationCode: d.locationCode,
    zone: d.zone ?? "storage",
    status: d.status,
    display_order: d.display_order ?? 100,
    note: d.note ?? null,
    createdAt: d.createdAt ?? null,
    updatedAt: d.updatedAt ?? null,
  }));
}

export async function adminCreateLocation(input: AdminLocationInput) {
  if (!/^[A-Za-z0-9_-]+$/.test(input.locationCode)) {
    throw new ApiError("INVALID_LOCATION_CODE");
  }
  const db = await connectToDatabase();
  // The unique (warehouseCode+locationCode) index protects us at the DB
  // level, but pre-check for a friendly 400.
  const dup = await db.collection(collections.LOCATION).findOne({
    warehouseCode: input.warehouseCode,
    locationCode: input.locationCode,
  });
  if (dup) throw new ApiError("LOCATION_DUPLICATED");
  const now = new Date();
  await db.collection(collections.LOCATION).insertOne({
    warehouseCode: input.warehouseCode,
    locationCode: input.locationCode,
    zone: input.zone ?? "storage",
    display_order: input.display_order ?? 100,
    note: input.note ?? null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  } as any);
  return { locationCode: input.locationCode };
}

export async function adminUpdateLocation(
  warehouseCode: string,
  locationCode: string,
  patch: { zone?: string; display_order?: number; note?: string | null }
) {
  const db = await connectToDatabase();
  const r = await db.collection(collections.LOCATION).updateOne(
    { warehouseCode, locationCode },
    {
      $set: {
        ...(patch.zone !== undefined ? { zone: patch.zone } : {}),
        ...(patch.display_order !== undefined
          ? { display_order: patch.display_order }
          : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        updatedAt: new Date(),
      },
    }
  );
  if (r.matchedCount === 0) throw new ApiError("LOCATION_NOT_FOUND");
}

export async function adminToggleLocation(
  warehouseCode: string,
  locationCode: string,
  status: "active" | "disabled"
) {
  const db = await connectToDatabase();
  const r = await db.collection(collections.LOCATION).updateOne(
    { warehouseCode, locationCode },
    { $set: { status, updatedAt: new Date() } }
  );
  if (r.matchedCount === 0) throw new ApiError("LOCATION_NOT_FOUND");
}

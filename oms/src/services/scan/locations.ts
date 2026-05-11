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

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Location, locationSchema } from "@/types/Warehouse";
import { ObjectId } from "mongodb";

const collection = collections.LOCATION;

export async function updateLocation(
  clientId: string,
  recordId: string,
  update: Partial<Location>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    _id: new ObjectId(recordId),
  };
  const location = await db.collection(collection).findOne(filter);
  if (!location) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...locationWithoutId } = location;

  update = {
    ...locationWithoutId,
    ...update,
    updatedAt: new Date(),
    updatedBy: clientId,
  };
  delete update.createdAt;
  locationSchema.parse(update);
  return await db.collection(collection).updateMany(
    filter,
    {
      $set: update,
    },
    options
  );
}

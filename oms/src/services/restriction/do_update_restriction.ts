import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Restriction, restrictionSchema } from "@/types/Warehouse";
import { ObjectId } from "mongodb";

const collection = collections.RESTRICTION;

export async function updateRestriction(
  clientId: string,
  recordId: string,
  update: Partial<Restriction>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    _id: new ObjectId(recordId),
  };
  const restriction = await db.collection(collection).findOne(filter);
  if (!restriction) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...restrictionWithoutId } = restriction;

  update = {
    ...restrictionWithoutId,
    ...update,
    updatedAt: new Date(),
    updatedBy: clientId,
  };
  delete update.createdAt;
  restrictionSchema.parse(update);
  return await db.collection(collection).updateMany(
    filter,
    {
      $set: update,
    },
    options
  );
}

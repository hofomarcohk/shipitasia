import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Category, categorySchema } from "@/types/Warehouse";
import { ObjectId } from "mongodb";

const collection = collections.CATEGORY;

export async function updateCategory(
  clientId: string,
  recordId: string,
  update: Partial<Category>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    _id: new ObjectId(recordId),
  };
  const category = await db.collection(collection).findOne(filter);
  if (!category) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...categoryWithoutId } = category;

  update = {
    ...categoryWithoutId,
    ...update,
    updatedAt: new Date(),
    updatedBy: clientId,
  };
  delete update.createdAt;
  categorySchema.parse(update);
  return await db.collection(collection).updateMany(
    filter,
    {
      $set: update,
    },
    options
  );
}

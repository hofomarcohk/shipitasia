import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Warehouse, warehouseSchema } from "@/types/Warehouse";
import { ObjectId } from "mongodb";

const collection = collections.WAREHOUSE;

export async function updateWarehouse(
  clientId: string,
  recordId: string,
  update: Partial<Warehouse>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    _id: new ObjectId(recordId),
  };
  const warehouse = await db.collection(collection).findOne(filter);
  if (!warehouse) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...warehouseWithoutId } = warehouse;
  console.log("updateupdate1", update);

  update = {
    ...warehouseWithoutId,
    ...update,
    updatedAt: new Date(),
    updatedBy: clientId,
  };
  console.log("updateupdate", update);
  warehouseSchema.parse(update);
  return await db.collection(collection).updateMany(
    filter,
    {
      $set: update,
    },
    options
  );
}

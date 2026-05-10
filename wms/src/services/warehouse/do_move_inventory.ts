import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.ITEM_LOCATION;

export async function moveInventory(
  clientId: string,
  itemCode: string,
  from: string,
  to: string
) {
  const db = await connectToDatabase();

  const now = new Date();
  const result = await db.collection(collection).findOne({
    locationCode: from,
    itemCode,
  });
  if (!result) {
    throw new ApiError("INVENTORY_NOT_FOUND");
  }

  return await db.collection(collection).updateMany(
    {
      itemCode,
      locationCode: from,
    },
    {
      $set: {
        locationCode: to,
        updatedAt: now,
        updatedBy: clientId,
      },
    }
  );
}

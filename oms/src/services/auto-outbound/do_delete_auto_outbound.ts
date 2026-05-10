import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.AUTO_OUTBOUND_SETTING;

export async function deleteAutoOutbound(clientId: string, filter: any) {
  const db = await connectToDatabase();
  const records = await db.collection(collection).find(filter).toArray();
  if (!records.length) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  for (let record of records) {
    if (record.clientId !== clientId) {
      throw new ApiError("RECORD_NOT_FOUND");
    }
  }
  const now = new Date();
  return await db.collection(collection).updateMany(filter, {
    $set: {
      deletedAt: now,
      updatedAt: now,
    },
  });
}

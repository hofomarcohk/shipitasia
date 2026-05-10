import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { INBOUND } from "@/cst/inbound";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.INBOUND;

export async function moveInventory(clientId: string, filter: any) {
  const db = await connectToDatabase();
  const inbounds = await db.collection(collection).find(filter).toArray();
  if (!inbounds.length) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  for (let inbound of inbounds) {
    if (inbound.status !== INBOUND.STATUS.PENDING) {
      throw new ApiError("INBOUND_NOT_CANCELABLE");
    }
    if (inbound.clientId !== clientId) {
      throw new ApiError("RECORD_NOT_FOUND");
    }
  }
  const now = new Date();
  return await db.collection(collection).updateMany(filter, {
    $set: {
      status: INBOUND.STATUS.CANCELLED,
      cancelledAt: now,
      updatedAt: now,
    },
  });
}

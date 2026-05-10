import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { OUTBOUND } from "@/cst/outbound";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.OUTBOUND;

export async function cancelOutbound(clientId: string, filter: any) {
  const db = await connectToDatabase();
  const inbounds = await db.collection(collection).find(filter).toArray();
  if (!inbounds.length) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  for (let inbound of inbounds) {
    if (inbound.status !== OUTBOUND.STATUS.PENDING) {
      throw new ApiError("INBOUND_NOT_CANCELABLE");
    }
    if (inbound.clientId !== clientId) {
      throw new ApiError("RECORD_NOT_FOUND");
    }
  }
  const now = new Date();
  return await db.collection(collection).updateMany(filter, {
    $set: {
      status: OUTBOUND.STATUS.CANCEL,
      cancelledAt: now,
      updatedAt: now,
    },
  });
}

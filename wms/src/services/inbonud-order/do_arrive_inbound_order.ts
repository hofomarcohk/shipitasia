import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { INBOUND } from "@/cst/inbound";
import { connectToDatabase } from "@/lib/mongo";
import { ArriveLogSchema } from "@/types/Inbound";

const collection = collections.INBOUND;
const collectionArriveLog = collections.ARRIVE_LOG;

export async function arriveInbound(staffId: string, filter: any) {
  const db = await connectToDatabase();
  const now = new Date();

  const inbounds = await db.collection(collection).find(filter).toArray();
  if (!inbounds.length) {
    throw new ApiError("RECORD_NOT_FOUND");
  }

  let arriveLogs = [];
  for (let inbound of inbounds) {
    if (inbound.status !== INBOUND.STATUS.PENDING) {
      throw new ApiError("INBOUND_NOT_CANCELABLE");
    }

    arriveLogs.push(
      ArriveLogSchema.parse({
        inboundId: inbound.orderId,
        staffId,
        arrivedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    );
  }
  await db.collection(collectionArriveLog).insertMany(arriveLogs);
  await db.collection(collection).updateMany(filter, {
    $set: {
      status: INBOUND.STATUS.ARRIVED,
      arrivedAt: now,
      updatedAt: now,
      updatedBy: staffId,
    },
  });
}

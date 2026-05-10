import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Inbound } from "@/types/Inbound";

const collection = collections.AUTO_OUTBOUND_SETTING;

export async function updateAutoOutbound(
  clientId: string,
  orderId: string,
  update: Partial<Inbound>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    orderId: orderId,
    clientId: clientId,
  };
  const inbound = await db.collection(collection).findOne(filter);
  if (!inbound) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...inboundWithoutId } = inbound;

  delete update.referenceNo;
  delete update.status;
  delete update.source;
  delete update.createdAt;
  delete update.cancelledAt;
  delete update.inboundingAt;
  delete update.inboundedAt;
  delete update.outboundedAt;
  delete update.outboundingAt;
  update.updatedAt = new Date();

  update = {
    ...inboundWithoutId,
    ...update,
  };

  update.updatedAt = new Date();
  return await db.collection(collection).updateMany(
    filter,
    {
      $set: update,
    },
    options
  );
}

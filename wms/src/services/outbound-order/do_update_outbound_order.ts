import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Outbound, OutboundSchema } from "@/types/Outbound";
import { ObjectId } from "mongodb";

const collection = collections.OUTBOUND;

export async function updateOutbound(
  clientId: string,
  recordId: string,
  update: Partial<Outbound>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    _id: new ObjectId(recordId),
    clientId: clientId,
  };
  const outbound = await db.collection(collection).findOne(filter);
  if (!outbound) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...outboundWithoutId } = outbound;

  update = {
    ...outboundWithoutId,
    ...update,
  };
  OutboundSchema.parse(update);
  update.updatedAt = new Date();
  return await db.collection(collection).updateMany(
    filter,
    {
      $set: update,
    },
    options
  );
}

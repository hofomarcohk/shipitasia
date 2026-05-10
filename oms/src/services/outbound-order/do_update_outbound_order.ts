import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Outbound } from "@/types/Outbound";
import { objExtract } from "../helpers/utils";
import { validateOutboundUpdate } from "./validate_outbound_order";

const collection = collections.OUTBOUND;

export async function updateOutbound(
  clientId: string,
  orderId: string,
  update: Partial<Outbound>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    orderId: orderId,
    clientId: clientId,
  };
  const outbound = await db.collection(collection).findOne(filter);
  if (!outbound) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...outboundWithoutId } = outbound;
  const data = {
    ...outboundWithoutId,
    // only allow update:
    ...objExtract(update, ["trackingNo", "logisticParty", "remarks", "to"]),
  };

  update.updatedAt = new Date();
  await validateOutboundUpdate(data);

  return await db
    .collection(collection)
    .updateMany(filter, { $set: update }, options);
}

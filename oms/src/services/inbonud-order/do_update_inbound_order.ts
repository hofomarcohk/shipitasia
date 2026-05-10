import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Inbound } from "@/types/Inbound";
import { getInboundRequest } from "./get_inbound_order_list";
import { validateInboundUpdate } from "./validate_inbound_order";

const collection = collections.INBOUND;
const collection_inbound = collections.INBOUND;

export async function updateInbound(
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

  const inbound = await db.collection(collection_inbound).findOne(filter);
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

  await validateInboundUpdate(update);

  update.updatedAt = new Date();
  return await db.collection(collection).updateMany(
    filter,
    {
      $set: update,
    },
    options
  );
}

export async function updateInboundDimension(
  orderId: string[],
  dimension: { width: number; length: number; height: number; weight: number }
) {
  const now = new Date();
  const db = await connectToDatabase();
  const filter = { orderId };

  let update: Partial<Inbound>;

  const orders = await getInboundRequest([
    { $match: filter },
    { $project: { orderId: 1 } },
  ]);

  if (orders.length == 0) {
    throw new ApiError("ORDER_NOT_FOUND");
  }

  update = { ...dimension, updatedAt: now };

  const result = await db
    .collection(collection)
    .updateMany({ ...filter }, { $set: { ...update } });

  return result.modifiedCount;
}

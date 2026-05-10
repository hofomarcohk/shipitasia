import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { INBOUND, INBOUND_WORKFLOW } from "@/cst/inbound";
import { connectToDatabase } from "@/lib/mongo";
import { Inbound } from "@/types/Inbound";
import { getInboundRequest } from "./get_inbound_order_list";

const collection = collections.INBOUND;

export async function updateInboundStatus(orderIds: string[], status: string) {
  const now = new Date();
  const db = await connectToDatabase();
  const filter = {
    orderId: { $in: orderIds },
  };

  let update: Partial<Inbound>;
  const fromStatus = INBOUND_WORKFLOW[status] ?? [];

  switch (status) {
    case INBOUND.STATUS.RECEIVED:
      update = { status, inboundedAt: now };
      break;

    case INBOUND.STATUS.OUTBOUNDING:
      update = { status, outboundingAt: now };
      break;

    case INBOUND.STATUS.OUTBOUNDED:
      update = { status, outboundedAt: now };
      break;

    default:
      throw new ApiError("INVALID_INBOUND_STATUS");
  }

  const orders = await getInboundRequest([
    { $match: filter },
    { $project: { orderId: 1 } },
  ]);

  if (orders.length !== orderIds.length) {
    throw new ApiError("ORDER_NOT_FOUND");
  }

  const result = await db
    .collection(collection)
    .updateMany(
      { ...filter, status: { $in: fromStatus } },
      { $set: { ...update } }
    );

  return result.modifiedCount;
}

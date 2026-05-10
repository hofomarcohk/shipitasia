import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { OUTBOUND, OUTBOUND_WORKFLOW } from "@/cst/outbound";
import { connectToDatabase } from "@/lib/mongo";
import { Outbound } from "@/types/Outbound";
import { getOutboundRequest } from "./get_outbound_order_list";

const collection = collections.OUTBOUND;

export async function updateOutboundStatus(orderIds: string[], status: string) {
  const now = new Date();
  const db = await connectToDatabase();
  let update: Partial<Outbound>;
  let fromStatus = OUTBOUND_WORKFLOW[status] ?? "";
  const filter = {
    orderId: { $in: orderIds },
  };
  switch (status) {
    case OUTBOUND.STATUS.PROCESSING:
      update = { status, outboundingAt: now };
      break;
    case OUTBOUND.STATUS.DEPARTED:
      update = { status, outboundedAt: now };
      break;
    case OUTBOUND.STATUS.CANCEL:
      update = { status, cancelledAt: now };
    default:
      throw new ApiError("INVALID_OUTBOUND_STATUS");
  }

  const orders = await getOutboundRequest([
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

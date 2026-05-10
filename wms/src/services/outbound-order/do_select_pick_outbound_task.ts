import { collections } from "@/cst/collections";
import { INBOUND } from "@/cst/inbound";
import { OUTBOUND } from "@/cst/outbound";
import { connectToDatabase } from "@/lib/mongo";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collectionPickList = collections.PICK_LIST;
const collectionOutbound = collections.OUTBOUND;
const collectionInbound = collections.INBOUND;

export async function selectPickOutboundTask(staff: string, orderId: string) {
  const db = await connectToDatabase();
  const [pickingAt, updatedAt, createdAt] = Array(4).fill(new Date());
  const [createdBy, updatedBy] = Array(2).fill(staff);

  const order = await db.collection(collectionOutbound).findOne({ orderId });

  if (!order) {
    return;
  }
  if (order.inboundRequestIds) {
    await db.collection(collectionInbound).updateMany(
      { orderId: { $in: order.inboundRequestIds } },
      {
        $set: {
          status: INBOUND.STATUS.PICKING,
          updatedAt,
          updatedBy,
        },
      }
    );
  }

  await db.collection(collectionOutbound).updateOne(
    { orderId },
    {
      $set: {
        status: OUTBOUND.STATUS.PICKING,
        pickingAt,
        updatedAt,
        updatedBy,
      },
    }
  );

  await db.collection(collectionPickList).updateMany(
    { orderId },
    {
      $set: {
        pickingAt,
        updatedAt,
      },
      $addToSet: {
        staffs: staff,
      },
      $setOnInsert: {
        pickedInboundRequestIds: [],
        orderId,
        createdAt,
        createdBy,
      },
    },
    {
      upsert: true,
    }
  );

  // call Shipping Service API to update order status
  const url = "/api/wms/outbound/updateOrderStatus";
  await callShippingServiceApi(
    staff,
    { method: "PUT", url },
    { orderIds: [orderId], status: "processing" }
  );
}

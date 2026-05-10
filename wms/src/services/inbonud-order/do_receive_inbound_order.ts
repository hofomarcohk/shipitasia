import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { INBOUND } from "@/cst/inbound";
import { WAREHOUSE } from "@/cst/warehouse";
import { connectToDatabase } from "@/lib/mongo";
import { ReceiveLogSchema } from "@/types/Inbound";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collectionInbound = collections.INBOUND;
const collectionItemLocation = collections.ITEM_LOCATION;
const collectionReceiveLog = collections.RECEIVE_LOG;

export async function receiveInbound(
  staffId: string,
  locationCode: string,
  orderIds: string[]
) {
  const db = await connectToDatabase();
  const now = new Date();

  const inbounds = await db
    .collection(collectionInbound)
    .find({
      orderId: { $in: orderIds },
    })
    .toArray();
  if (!inbounds.length) {
    throw new ApiError("RECORD_NOT_FOUND");
  }

  let itemLocations = [];
  let receiveLogs = [];
  for (let inbound of inbounds) {
    if (inbound.status !== INBOUND.STATUS.ARRIVED) {
      throw new ApiError("INBOUND_NOT_RECEIVABLE");
    }

    itemLocations.push({
      locationCode,
      itemType: WAREHOUSE.ITEM_TYPE.SHIPMENT,
      itemCode: inbound.orderId,
      warehouseCode: inbound.warehouseCode,
    });

    receiveLogs.push(
      ReceiveLogSchema.parse({
        inboundId: inbound.orderId,
        locationCode,
        staffId,
        receivedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    );
  }

  // add item location
  await db.collection(collectionItemLocation).insertMany(itemLocations);

  // add receive log
  await db.collection(collectionReceiveLog).insertMany(receiveLogs);

  // update inbound status
  await db.collection(collectionInbound).updateMany(
    {
      orderId: { $in: orderIds },
      status: INBOUND.STATUS.ARRIVED,
    },
    {
      $set: {
        status: INBOUND.STATUS.RECEIVED,
        receivedAt: now,
        updatedAt: now,
        updatedBy: staffId,
      },
    }
  );
  const url = "/api/wms/inbound/updateOrderStatus";
  await callShippingServiceApi(
    staffId,
    { method: "PUT", url },
    { orderIds, status: "received" }
  );
  return;
}

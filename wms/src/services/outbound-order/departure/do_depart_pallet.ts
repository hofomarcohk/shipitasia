import { collections } from "@/cst/collections";
import { INBOUND } from "@/cst/inbound";
import { OUTBOUND } from "@/cst/outbound";
import { connectToDatabase } from "@/lib/mongo";
import { callShippingServiceApi } from "@/services/api/handle_sms_api";

const collectionDepartureList = collections.DEPARTURE_LIST;
const collectionPalletList = collections.PALLET_LIST;

export async function getPallet(palletCode: string) {
  const db = await connectToDatabase();
  return await db.collection(collectionPalletList).findOne({ palletCode });
}

export async function getDepartureList(palletCode: string) {
  const db = await connectToDatabase();
  return await db.collection(collectionDepartureList).findOne({ palletCode });
}
export async function doDeparturePallet(staff: string, palletCode: string) {
  const db = await connectToDatabase();
  const updatedAt = new Date();
  const updatedBy = staff;

  await db.collection(collectionDepartureList).updateOne(
    { palletCode },
    {
      $set: {
        departuredBy: staff,
        updatedAt,
        updatedBy,
      },
    },
    { upsert: true }
  );

  const orders = await db
    .collection(collectionPalletList)
    .aggregate([
      { $match: { palletCode } },
      { $project: { boxNo: 1 } },
      {
        $lookup: {
          from: collections.PACK_LIST,
          localField: "boxNo",
          foreignField: "boxNo",
          as: "packLists",
        },
      },
      { $unwind: { path: "$packLists", preserveNullAndEmptyArrays: false } },
      {
        $project: {
          outboundOrderID: "$packLists.outboundOrderID",
          inboundOrderID: "$packLists.inboundOrderID",
        },
      },
    ])
    .toArray();

  const inboundOrderIds = orders.map((order) => order.inboundOrderID);
  const outboundOrderIds = orders.map((order) => order.outboundOrderID);
  const excludeOutboundOrderIds: string[] = [];

  const outboundRequests = await db
    .collection(collections.PACK_LIST)
    .aggregate([
      { $match: { outboundOrderID: { $in: outboundOrderIds } } },
      {
        $lookup: {
          from: collections.PALLET_LIST,
          localField: "boxNo",
          foreignField: "boxNo",
          as: "pallets",
        },
      },
      {
        $lookup: {
          from: collections.DEPARTURE_LIST,
          localField: "pallets.palletCode",
          foreignField: "palletCode",
          as: "departuredPallets",
          pipeline: [{ $match: { departuredBy: { $exists: true } } }],
        },
      },
    ])
    .toArray();

  outboundRequests.forEach((request) => {
    let departedPallets: { [key: string]: boolean } = {};
    request.departuredPallets.map((departuredPallet: any) => {
      departedPallets[departuredPallet.palletCode] = true;
    });

    request.pallets.forEach((pallet: any) => {
      if (!departedPallets[pallet.palletCode]) {
        excludeOutboundOrderIds.push(request.outboundOrderID);
      }
    });
  });

  const departedOutboundOrderIds = outboundOrderIds.filter(
    (id) => !excludeOutboundOrderIds.includes(id)
  );

  // update outbound request status
  db.collection(collections.OUTBOUND).updateMany(
    { orderId: { $in: departedOutboundOrderIds } },
    { $set: { status: OUTBOUND.STATUS.DEPARTED, updatedAt, updatedBy } }
  );

  // update inbound request status
  db.collection(collections.INBOUND).updateMany(
    { orderId: { $in: inboundOrderIds } },
    { $set: { status: INBOUND.STATUS.DEPARTED, updatedAt, updatedBy } }
  );

  // call shipping service
  await callShippingServiceApi(
    staff,
    { method: "PUT", url: "/api/wms/inbound/updateOrderStatus" },
    { status: "outbounded", orderIds: inboundOrderIds }
  );

  await callShippingServiceApi(
    staff,
    { method: "PUT", url: "/api/wms/outbound/updateOrderStatus" },
    { status: "departed", orderIds: departedOutboundOrderIds }
  );

  return outboundRequests;
}

import { collections } from "@/cst/collections";
import { INBOUND } from "@/cst/inbound";
import { OUTBOUND } from "@/cst/outbound";
import { connectToDatabase } from "@/lib/mongo";

const collectionPalletList = collections.PALLET_LIST;

export async function palletizeBox(
  staff: string,
  palletCode: string,
  boxNo: string
) {
  const db = await connectToDatabase();
  const updatedAt = new Date();
  const createdAt = updatedAt;
  const updatedBy = staff;

  await db.collection(collectionPalletList).updateOne(
    { boxNo },
    {
      $set: { palletCode, updatedAt, updatedBy },
      $setOnInsert: { boxNo, createdBy: staff, createdAt },
    },
    { upsert: true }
  );

  // check if all boxes in order is palletized
  const packList = await db
    .collection(collections.PACK_LIST)
    .aggregate([
      { $match: { boxNo } },
      { $project: { outboundOrderID: 1 } },
      {
        $lookup: {
          from: collections.OUTBOUND,
          localField: "outboundOrderID",
          foreignField: "orderId",
          as: "outboundRequest",
        },
      },
      {
        $unwind: { path: "$outboundRequest", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: collections.PACK_LIST,
          localField: "outboundRequest.inboundRequestIds",
          foreignField: "inboundOrderID",
          as: "packLists",
        },
      },
      { $unwind: { path: "$packLists", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          outboundOrderID: 1,
          boxNo: "$packLists.boxNo",
          inboundOrderID: "$packLists.inboundOrderID",
        },
      },
      {
        $lookup: {
          from: collections.PALLET_LIST,
          localField: "boxNo",
          foreignField: "boxNo",
          as: "pallet",
        },
      },
      { $unwind: { path: "$pallet", preserveNullAndEmptyArrays: true } },
    ])
    .toArray();

  let isPalletized = true;
  for (const item of packList) {
    if (!item.pallet) {
      isPalletized = false;
      break;
    }
  }

  if (isPalletized) {
    // update outbound request status
    await db.collection(collections.OUTBOUND).updateOne(
      { orderId: packList[0].outboundOrderID },
      {
        $set: {
          status: OUTBOUND.STATUS.PALLETIZED,
          updatedAt,
          updatedBy,
        },
      }
    );

    // update inbound request status
    await Promise.all(
      packList.map(async (item) => {
        await db.collection(collections.INBOUND).updateOne(
          { orderId: item.inboundOrderID },
          {
            $set: {
              status: INBOUND.STATUS.PALLETIZED,
              updatedAt,
              updatedBy,
            },
          }
        );
      })
    );
  }

  return packList;
}

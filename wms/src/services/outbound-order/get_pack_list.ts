import { collections } from "@/cst/collections";
import { aggregatePackList } from "./getter";

export async function getPackListByBoxNo(boxNo: string) {
  return await aggregatePackList([{ $match: { boxNo } }]);
}

export async function getPackedItems(orderId: string) {
  const packedItemMap: { [key: string]: any } = {};
  (
    await aggregatePackList([
      { $match: { outboundOrderID: orderId } },
      {
        $lookup: {
          from: collections.INBOUND,
          localField: "inboundOrderID",
          foreignField: "orderId",
          as: "inbound",
        },
      },
      { $unwind: "$inbound" },
      {
        $project: {
          _id: 0,
          boxNo: 1,
          inboundOrderID: 1,
          trackingNo: "$inbound.trackingNo",
        },
      },
    ])
  )?.map((a) => {
    if (!packedItemMap[a.boxNo]) {
      packedItemMap[a.boxNo] = {
        boxCode: a.boxNo,
        items: [],
      };
    }
    packedItemMap[a.boxNo].items.push({
      orderId: a.inboundOrderID,
      trackingNo: a.trackingNo,
    });
  });

  return Object.values(packedItemMap);
}

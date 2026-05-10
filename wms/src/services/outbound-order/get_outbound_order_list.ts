import { collections } from "@/cst/collections";
import { OUTBOUND } from "@/cst/outbound";
import { connectToDatabase } from "@/lib/mongo";
import { aggregatePickList } from "./getter";

const collection = collections.OUTBOUND;
const collectionPickList = collections.PICK_LIST;

export async function getOutboundRequest(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function countOutboundRequest(data: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(data);
}

export async function getOutboundPickList(
  pageNo: number,
  pageSize: number = 10
) {
  const db = await connectToDatabase();
  return await db
    .collection(collection)
    .aggregate([
      {
        $match: {
          status: { $in: [OUTBOUND.STATUS.PENDING, OUTBOUND.STATUS.PICKING] },
        },
      },
      {
        $lookup: {
          from: collections.PICK_LIST,
          localField: "orderId",
          foreignField: "orderId",
          as: "pickList",
        },
      },
      { $addFields: { staffs: { $first: "$pickList.staffs" } } },
      { $project: { pickList: 0 } },
      { $sort: { createdAt: 1 } },
      { $skip: (pageNo - 1) * pageSize },
      { $limit: pageSize },
    ])
    .toArray();
}

export async function getOutboundPickLocationList(
  staff: string,
  warehouseCode: string,
  pageNo: number,
  pageSize: number = 10
) {
  return await aggregatePickList([
    { $match: { staffs: { $in: [staff] }, pickedAt: { $exists: false } } },
    {
      $lookup: {
        from: collections.OUTBOUND,
        localField: "orderId",
        foreignField: "orderId",
        as: "outbound",
      },
    },
    { $addFields: { InboundIds: { $first: "$outbound.inboundRequestIds" } } },
    { $unwind: "$InboundIds" },
    {
      $lookup: {
        from: collections.ITEM_LOCATION,
        localField: "InboundIds",
        foreignField: "itemCode",
        as: "itemLocations",
        pipeline: [{ $match: { warehouseCode } }],
      },
    },
    { $addFields: { locationCode: { $first: "$itemLocations.locationCode" } } },
    {
      $group: {
        _id: "$locationCode",
        location: { $first: "$locationCode" },
        inboundRequestIds: { $addToSet: "$InboundIds" },
      },
    },
    { $sort: { location: 1 } },
    { $skip: (pageNo - 1) * pageSize },
    { $limit: pageSize },
  ]);
}

export async function getOutboundPickLocationItemList(
  staff: string,
  warehouseCode: string,
  locationCode: string,
  itemCode: string,
  pageNo: number,
  options: { search?: string; pageSize?: number } = {}
) {
  const pageSize = options.pageSize || 10;

  return await aggregatePickList([
    { $match: { staffs: { $in: [staff] } } },
    {
      $lookup: {
        from: collections.OUTBOUND,
        localField: "orderId",
        foreignField: "orderId",
        as: "outbound",
      },
    },
    {
      $addFields: {
        InboundIds: { $first: "$outbound.inboundRequestIds" },
      },
    },
    { $unwind: "$InboundIds" },
    {
      $lookup: {
        from: collections.ITEM_LOCATION,
        localField: "InboundIds",
        foreignField: "itemCode",
        as: "itemLocations",
        pipeline: [
          {
            $match: {
              warehouseCode,
              locationCode,
            },
          },
        ],
      },
    },
    {
      $match: {
        itemLocations: { $ne: [] },
      },
    },
    {
      $lookup: {
        from: collections.INBOUND,
        localField: "InboundIds",
        foreignField: "orderId",
        as: "inbound",
        pipeline: [
          {
            $match: {
              ...(itemCode != ""
                ? {
                    $or: [{ orderId: itemCode }, { trackingNo: itemCode }],
                  }
                : {}),
            },
          },
        ],
      },
    },
    { $unwind: "$inbound" },
    {
      $project: { _id: 0, inbound: 1 },
    },
    { $replaceRoot: { newRoot: "$inbound" } },
    { $skip: (pageNo - 1) * pageSize },
    { $limit: pageSize },
  ]);
}

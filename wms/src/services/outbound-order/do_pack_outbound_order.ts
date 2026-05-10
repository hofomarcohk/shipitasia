import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { OUTBOUND } from "@/cst/outbound";
import { connectToDatabase } from "@/lib/mongo";
import { PackBox, PackBoxSchema } from "@/types/Outbound";
import { Dimension } from "@/types/Utils";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collectionPackList = collections.PACK_LIST;
const collectionPackBoxes = collections.PACK_BOXES;

export async function packItem(staff: string, orderId: string, boxNo: string) {
  const db = await connectToDatabase();
  const updatedAt = new Date();
  const updatedBy = staff;

  const outboundRequest = await db.collection(collections.OUTBOUND).findOne({
    inboundRequestIds: orderId,
  });

  if (!outboundRequest) {
    throw new ApiError("OUTBOUND_NOT_FOUND");
  }

  switch (outboundRequest.status) {
    case OUTBOUND.STATUS.PENDING:
      throw new ApiError("OUTBOUND_NOT_PICKED");
    case OUTBOUND.STATUS.PICKING:
      throw new ApiError("OUTBOUND_NOT_PICKED");
    case OUTBOUND.STATUS.PICKED:
    case OUTBOUND.STATUS.PACKING:
      break;
    case OUTBOUND.STATUS.PACKED:
    case OUTBOUND.STATUS.PALLETIZED:
    case OUTBOUND.STATUS.DEPARTED:
      throw new ApiError("OUTBOUND_PACKED");
    case OUTBOUND.STATUS.CANCELLED:
    case OUTBOUND.STATUS.HOLD:
      throw new ApiError("OUTBOUND_NOT_PACKED");
    default:
  }

  // check all items in the box are packed
  await db.collection(collectionPackList).updateOne(
    { orderId, boxNo },
    {
      $set: { updatedAt, updatedBy },
      $setOnInsert: {
        orderId,
        boxNo,
        inboundOrderID: orderId,
        outboundOrderID: outboundRequest.orderId,
        createdBy: staff,
        createdAt: updatedAt,
      },
    },
    { upsert: true },
  );

  // create pack box info
  const outboundBoxes = outboundRequest.boxes ?? [];
  if (!outboundBoxes.find((b: PackBox) => b.boxNo === boxNo)) {
    outboundBoxes.push({
      boxNo,
      trackingNo: "",
      width: 0,
      length: 0,
      height: 0,
      weight: 0,
    });
  }

  let status = OUTBOUND.STATUS.PACKING;
  await db
    .collection(collections.OUTBOUND)
    .updateOne(
      { _id: outboundRequest._id },
      { $set: { status, updatedAt, updatedBy, boxes: outboundBoxes } },
    );
}

export async function emptyBox(staff: string, boxNo: string) {
  const db = await connectToDatabase();
  const box = await db.collection(collectionPackList).findOne({
    boxNo,
  });
  if (!box) {
    throw new ApiError("BOX_NOT_FOUND");
  }
  const outboundRequest = await db.collection(collections.OUTBOUND).findOne({
    orderId: box.outboundOrderID,
  });

  if (!outboundRequest) {
    throw new ApiError("OUTBOUND_NOT_FOUND");
  }

  switch (outboundRequest.status) {
    case OUTBOUND.STATUS.PACKING:
      break;
    default:
      throw new ApiError("OUTBOUND_NOT_PACKING");
  }

  // remove box at outbound request
  const boxes = (outboundRequest.boxes ?? []).filter((b: PackBox) => {
    return b.boxNo !== boxNo;
  });
  const updatedAt = new Date();
  const updatedBy = staff;

  await db
    .collection(collections.OUTBOUND)
    .updateOne(
      { _id: outboundRequest._id },
      { $set: { updatedAt, updatedBy, boxes } },
    );

  await db.collection(collectionPackList).deleteMany({ boxNo });
}

export async function packFinish(staff: string, orderId: string) {
  const db = await connectToDatabase();
  const updatedAt = new Date();
  const updatedBy = staff;

  const outboundRequest = await db.collection(collections.OUTBOUND).findOne({
    orderId,
  });

  if (!outboundRequest) {
    throw new ApiError("OUTBOUND_NOT_FOUND");
  }

  switch (outboundRequest.status) {
    case OUTBOUND.STATUS.PACKING:
    case OUTBOUND.STATUS.PACKED:
      break;
    default:
      throw new ApiError("OUTBOUND_NOT_PACKING");
  }

  const status = OUTBOUND.STATUS.PACKED;
  const getTracking = async () => {
    if (outboundRequest.status === OUTBOUND.STATUS.PACKING || true) {
      const getTrackingNo = await callShippingServiceApi(
        staff,
        {
          method: "POST",
          url: "/api/wms/outbound/getOrderTrackingLabel",
        },
        { orderId, boxNoList: outboundRequest.boxes },
      );
      const trackingNo = getTrackingNo?.responseJson?.data?.trackingNo;
      return { trackingNo };
    }
    return {};
  };

  const a = await getTracking();
  console.log("aaaaaa", a);

  await db.collection(collections.OUTBOUND).updateOne(
    { orderId },
    {
      $set: { status, updatedAt, updatedBy, ...a },
    },
  );
}

export async function updatePackBoxDimensions(
  staff: string,
  orderId: string,
  dimensions: ({ boxNo: string } & Dimension)[],
) {
  const db = await connectToDatabase();
  const updatedAt = new Date();
  const updatedBy = staff;
  const outboundRequest = await db.collection(collections.OUTBOUND).findOne({
    orderId,
  });
  if (!outboundRequest) {
    throw new ApiError("OUTBOUND_NOT_FOUND");
  }

  const dimensionMap = dimensions.reduce(
    (acc: { [key: string]: { boxNo: string } & Dimension }, cur) => {
      acc[cur.boxNo] = cur;
      return acc;
    },
    {},
  );
  const boxes = (outboundRequest.boxes ?? [])?.map((box: PackBox) => {
    return PackBoxSchema.parse({
      ...box,
      ...dimensionMap[box.boxNo],
    });
  });

  await db
    .collection(collections.OUTBOUND)
    .updateOne(
      { _id: outboundRequest._id },
      { $set: { updatedAt, updatedBy, boxes } },
    );
}

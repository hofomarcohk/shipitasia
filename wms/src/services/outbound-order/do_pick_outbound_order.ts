import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { OUTBOUND } from "@/cst/outbound";
import { connectToDatabase } from "@/lib/mongo";

const collectionOutbound = collections.OUTBOUND;
const collectionItemLocation = collections.ITEM_LOCATION;
const collectionPickList = collections.PICK_LIST;

export async function pickOutbound(
  username: string,
  warehouseCode: string,
  locationCode: string,
  itemCode: string,
  itemType: string = "shipment"
) {
  const db = await connectToDatabase();

  const itemLocation = await db.collection(collectionItemLocation).findOne({
    warehouseCode,
    locationCode,
    itemType,
    itemCode,
  });

  if (!itemLocation) {
    throw new ApiError("INVENTORY_NOT_FOUND");
  }

  switch (itemType) {
    case "shipment":
      // update outbound order status
      const outboundOrder = await db.collection(collectionOutbound).findOne({
        inboundRequestIds: {
          $in: [itemCode],
        },
      });
      if (!outboundOrder) {
        throw new ApiError("RECORD_NOT_FOUND");
      }

      // push to pick list
      const pickList = await db.collection(collectionPickList).findOne({
        orderId: outboundOrder.orderId,
      });

      if (!pickList) {
        throw new ApiError("PICK_LIST_NOT_FOUND");
      }

      if (pickList.pickedInboundRequestIds.includes(itemCode)) {
        throw new ApiError("ITEM_PICKED_ALREADY");
      }

      // update pick list
      await db.collection(collectionPickList).updateOne(
        {
          _id: pickList._id,
        },
        {
          $set: {
            pickedInboundRequestIds: [
              ...pickList.pickedInboundRequestIds,
              itemCode,
            ],
          },
        }
      );

      if (
        pickList.pickedInboundRequestIds.length + 1 ===
        outboundOrder.inboundRequestIds.length
      ) {
        // update outbound order status
        await db.collection(collectionOutbound).updateOne(
          {
            _id: outboundOrder._id,
          },
          {
            $set: {
              status: OUTBOUND.STATUS.PICKED,
              pickedAt: new Date(),
              updatedAt: new Date(),
              updatedBy: username,
            },
          }
        );

        await db.collection(collectionPickList).updateOne(
          {
            _id: pickList._id,
          },
          {
            $set: {
              pickedAt: new Date(),
              updatedAt: new Date(),
              updatedBy: username,
            },
          }
        );
      }
  }

  // update location
  await db.collection(collectionItemLocation).updateOne(
    {
      warehouseCode,
      locationCode,
      itemType,
      itemCode,
    },
    {
      $set: {
        locationCode: username,
        updatedAt: new Date(),
        updatedBy: username,
      },
    }
  );
}

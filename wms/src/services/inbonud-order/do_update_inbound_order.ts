import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Inbound, InboundSchema } from "@/types/Inbound";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collection = collections.INBOUND;

export async function updateInbound(
  staffId: string,
  orderId: string,
  update: Partial<Inbound>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    orderId,
  };
  const inbound = await db.collection(collection).findOne(filter);
  if (!inbound) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...inboundWithoutId } = inbound;

  update = {
    ...inboundWithoutId,
    ...update,
  };
  update.updatedAt = new Date();
  update.receivedAt = update.receivedAt && new Date(update.receivedAt);
  update.updatedBy = staffId;
  update.weight = Number(update.weight);
  update.height = Number(update.height);
  update.length = Number(update.length);
  update.width = Number(update.width);
  InboundSchema.parse(update);

  await db.collection(collection).updateMany(filter, { $set: update }, options);

  const url = "/api/wms/inbound/updateOrderDimension";
  const a = await callShippingServiceApi(
    staffId,
    { method: "PUT", url },
    {
      orderId,
      dimension: {
        weight: update.weight,
        height: update.height,
        length: update.length,
        width: update.width,
      },
    }
  );
  console.log("aaaaa", a);
}

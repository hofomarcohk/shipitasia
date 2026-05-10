import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Warehouse, warehouseSchema } from "@/types/Warehouse";
import { ObjectId } from "mongodb";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collection = collections.WAREHOUSE;

export async function updateWarehouse(
  clientId: string,
  recordId: string,
  update: Partial<Warehouse>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    _id: new ObjectId(recordId),
  };
  const warehouse = await db.collection(collection).findOne(filter);
  if (!warehouse) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...warehouseWithoutId } = warehouse;
  update = {
    ...warehouseWithoutId,
    ...update,
    updatedAt: new Date(),
    updatedBy: clientId,
  };
  warehouseSchema.parse(update);
  const result = await db.collection(collection).updateMany(
    filter,
    {
      $set: update,
    },
    options
  );
  await callShippingServiceApi(
    clientId,
    { method: "PUT", url: `/api/wms/utils/sync` },
    {
      collection,
      filter: { warehouseCode: update.warehouseCode },
      update,
    }
  );
  return result;
}

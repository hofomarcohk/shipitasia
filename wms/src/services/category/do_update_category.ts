import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Category, categorySchema } from "@/types/Warehouse";
import { ObjectId } from "mongodb";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collection = collections.CATEGORY;

export async function updateCategory(
  adminId: string,
  recordId: string,
  update: Partial<Category>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    _id: new ObjectId(recordId),
  };
  const category = await db.collection(collection).findOne(filter);
  if (!category) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...categoryWithoutId } = category;

  update = {
    ...categoryWithoutId,
    ...update,
    updatedAt: new Date(),
    updatedBy: adminId,
  };
  delete update.createdAt;
  categorySchema.parse(update);
  await db.collection(collection).updateMany(filter, { $set: update }, options);
  await callShippingServiceApi(
    adminId,
    { method: "PUT", url: `/api/wms/utils/sync` },
    {
      collection,
      filter: { categoryKey: update.categoryKey },
      update,
    }
  );
}

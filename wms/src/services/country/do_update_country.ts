import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Country, countrySchema } from "@/types/Warehouse";
import { ObjectId } from "mongodb";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collection = collections.COUNTRY;

export async function updateCountry(
  adminId: string,
  recordId: string,
  update: Partial<Country>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = { _id: new ObjectId(recordId) };
  const country = await db.collection(collection).findOne(filter);
  if (!country) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...countryWithoutId } = country;

  update = {
    ...countryWithoutId,
    ...update,
    updatedAt: new Date(),
    updatedBy: adminId,
  };
  delete update.createdAt;
  countrySchema.parse(update);
  await db.collection(collection).updateMany(filter, { $set: update }, options);
  await callShippingServiceApi(
    adminId,
    { method: "PUT", url: `/api/wms/utils/sync` },
    {
      collection,
      filter: { categoryKey: update.countryKey },
      update,
    }
  );
}

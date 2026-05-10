import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Country, countrySchema } from "@/types/Warehouse";
import { ObjectId } from "mongodb";

const collection = collections.COUNTRY;

export async function updateCountry(
  clientId: string,
  recordId: string,
  update: Partial<Country>,
  options: any = {}
) {
  const db = await connectToDatabase();
  const filter = {
    _id: new ObjectId(recordId),
  };
  const country = await db.collection(collection).findOne(filter);
  if (!country) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...countryWithoutId } = country;

  update = {
    ...countryWithoutId,
    ...update,
    updatedAt: new Date(),
    updatedBy: clientId,
  };
  delete update.createdAt;
  countrySchema.parse(update);
  return await db.collection(collection).updateMany(
    filter,
    {
      $set: update,
    },
    options
  );
}

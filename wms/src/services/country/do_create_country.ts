import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Country, countrySchema } from "@/types/Warehouse";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collection = collections.COUNTRY;

export async function createCountry(adminId: string, docs: Country[]) {
  const db = await connectToDatabase();
  docs.map((doc) => {
    doc.createdAt = new Date();
    doc.updatedAt = new Date();
    doc.createdBy = adminId;
    return countrySchema.parse(doc);
  });

  await db.collection(collection).insertMany(docs);
  await callShippingServiceApi(
    adminId,
    { method: "POST", url: `/api/wms/utils/sync` },
    { collection, docs }
  );
  return {};
}

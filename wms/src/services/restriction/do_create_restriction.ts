import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Restriction, restrictionSchema } from "@/types/Warehouse";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collection = collections.RESTRICTION;

export async function createRestriction(adminId: string, docs: Restriction[]) {
  const db = await connectToDatabase();
  docs.map((doc) => {
    doc.createdAt = new Date();
    doc.updatedAt = new Date();
    doc.createdBy = adminId;
    return restrictionSchema.parse(doc);
  });

  await db.collection(collection).insertMany(docs);
  await callShippingServiceApi(
    adminId,
    { method: "POST", url: `/api/wms/utils/sync` },
    { collection, docs }
  );
  return {};
}

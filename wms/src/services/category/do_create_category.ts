import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Category, categorySchema } from "@/types/Warehouse";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collection = collections.CATEGORY;

export async function createCategory(adminId: string, docs: Category[]) {
  const db = await connectToDatabase();
  docs.map((doc) => {
    doc.createdAt = new Date();
    doc.updatedAt = new Date();
    doc.createdBy = adminId;
    return categorySchema.parse(doc);
  });

  await db.collection(collection).insertMany(docs);
  await callShippingServiceApi(
    adminId,
    { method: "POST", url: `/api/wms/utils/sync` },
    { collection, docs }
  );
  return {};
}

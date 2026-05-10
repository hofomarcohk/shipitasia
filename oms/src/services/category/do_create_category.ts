import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Category, categorySchema } from "@/types/Warehouse";

const collection = collections.CATEGORY;

export async function createCategory(clientId: string, docs: Category[]) {
  const db = await connectToDatabase();
  docs.map((doc) => {
    doc.createdAt = new Date();
    doc.updatedAt = new Date();
    doc.createdBy = clientId;
    return categorySchema.parse(doc);
  });

  await db.collection(collection).insertMany(docs);
  return {};
}

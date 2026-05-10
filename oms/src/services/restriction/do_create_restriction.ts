import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Restriction, restrictionSchema } from "@/types/Warehouse";

const collection = collections.RESTRICTION;

export async function createRestriction(
  clientId: string,
  docs: Restriction[]
) {
  const db = await connectToDatabase();
    docs.map((doc) => {
      doc.createdAt = new Date();
      doc.updatedAt = new Date();
      doc.createdBy = clientId;
      return restrictionSchema.parse(doc);
    });
  
    await db.collection(collection).insertMany(docs);
    return {};
}

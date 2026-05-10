import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Country, countrySchema } from "@/types/Warehouse";

const collection = collections.COUNTRY;

export async function createCountry(
  clientId: string,
  docs: Country[]
) {
  const db = await connectToDatabase();
    docs.map((doc) => {
      doc.createdAt = new Date();
      doc.updatedAt = new Date();
      doc.createdBy = clientId;
      return countrySchema.parse(doc);
    });
  
    await db.collection(collection).insertMany(docs);
    return {};
}

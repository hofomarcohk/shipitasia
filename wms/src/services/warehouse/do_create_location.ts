import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Location, locationSchema } from "@/types/Warehouse";
import { randomUUID } from "crypto";

const collection = collections.LOCATION;

export async function createLocation(
  clientId: string,
  docs: Location[]
) {
  const db = await connectToDatabase();
    docs.map((doc) => {
      doc.locationId = randomUUID();
      doc.createdAt = new Date();
      doc.updatedAt = new Date();
      doc.createdBy = clientId;
      return locationSchema.parse(doc);
    });  
    await db.collection(collection).insertMany(docs);
    return {};
}

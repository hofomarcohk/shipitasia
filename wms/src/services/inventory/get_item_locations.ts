import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.ITEM_LOCATION;

export async function aggItemLocations(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}
export async function countItemLocations(data: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(data);
}

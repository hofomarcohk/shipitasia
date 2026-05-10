import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.LOCATION;

export async function getLocation(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function countLocation(filter: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(filter);
}
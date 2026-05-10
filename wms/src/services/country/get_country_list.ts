import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.COUNTRY;

export async function getCountry(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function countCountry(filter: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(filter);
}
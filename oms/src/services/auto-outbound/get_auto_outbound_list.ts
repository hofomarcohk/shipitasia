import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.AUTO_OUTBOUND_SETTING;

export async function countAutoOutbound(data: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(data);
}

export async function getAutoOutbound(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.INBOUND;

export async function countInboundRequest(data: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(data);
}

export async function getInboundRequest(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

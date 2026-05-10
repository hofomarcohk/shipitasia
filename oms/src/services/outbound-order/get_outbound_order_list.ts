import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.OUTBOUND;

export async function countOutboundRequest(data: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(data);
}

export async function getOutboundRequest(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function getOutboundRequestByOrderId(orderId: string) {
  const db = await connectToDatabase();
  return await db.collection(collection).findOne({ orderId });
}

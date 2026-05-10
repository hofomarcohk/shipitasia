import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collectionOutbound = collections.OUTBOUND;
const collectionPackList = collections.PACK_LIST;
const collectionPickList = collections.PICK_LIST;

export async function aggregatePickList(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collectionPickList).aggregate(pipe).toArray();
}

export async function aggregatePackList(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collectionPackList).aggregate(pipe).toArray();
}

export async function aggregateOutbound(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collectionOutbound).aggregate(pipe).toArray();
}

export async function findOutboundByOrderId(orderId: string) {
  const db = await connectToDatabase();
  return await db.collection(collectionOutbound).findOne({ orderId });
}

export async function countOutboundRequest(data: any) {
  const db = await connectToDatabase();
  return await db.collection(collectionOutbound).countDocuments(data);
}

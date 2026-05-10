import { connectToDatabase } from "@/lib/mongo";

// mongo
export async function mongoGet(collection: string, condition: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).findOne(condition);
}
export async function mongoAdd(collection: string, data: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).insertOne(data);
}
export async function mongoAdds(collection: string, data: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).insertMany(data);
}
export async function mongoEdit(collection: string, filter: any, data: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).updateMany(filter, data);
}
export async function mongoDelete(collection: string, filter: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).deleteMany(filter);
}
export async function mongoAggregate(collection: string, pipeline: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipeline).toArray();
}

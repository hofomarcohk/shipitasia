import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.RESTRICTION;

export async function getRestriction(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function countRestriction(filter: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(filter);
}

export async function getRestrictionMap(pipe: any) {
  return (await getRestriction(pipe)).reduce((acc: any, item: any) => {
    acc[item.restrictionKey] = item;
    return acc;
  }, {});
}

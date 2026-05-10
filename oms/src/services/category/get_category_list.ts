import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.CATEGORY;

export async function getCategory(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function countCategory(filter: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(filter);
}

export async function getCategoryMap(pipe: any) {
  return (await getCategory(pipe)).reduce((acc: any, item: any) => {
    acc[item.categoryKey] = item;
    return acc;
  }, {});
}

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.CATEGORY;

export async function aggregateCategory(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function countCategory(filter: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(filter);
}

export async function getCategoryOptions(lang: string) {
  return await aggregateCategory([
    { $match: { deletedAt: { $exists: false } } },
    {
      $project: {
        value: "$categoryKey",
        label: "$text." + lang,
      },
    },
    { $sort: { value: 1 } },
  ]);
}

export async function getCategory(
  match: any,
  sort: any,
  pageNo: number,
  pageSize: number
) {
  return await aggregateCategory([
    { $match: match },
    { $sort: sort },
    { $skip: (Number(pageNo) - 1) * Number(pageSize) },
    { $limit: Number(pageSize) },
  ]);
}

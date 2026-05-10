import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Sort } from "mongodb";

const collection = collections.RESTRICTION;

export async function aggregateRestriction(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function countRestriction(filter: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(filter);
}

export async function getRestrictionOption(lang: string) {
  return await aggregateRestriction([
    { $match: { deletedAt: { $exists: false } } },
    {
      $project: {
        value: "$restrictionKey",
        label: "$text." + lang,
      },
    },
    { $sort: { value: 1 } },
  ]);
}

export async function getRestriction(
  match: any,
  sort: Sort,
  pageNo: number,
  pageSize: number
) {
  return await aggregateRestriction([
    { $match: match },
    { $sort: sort },
    { $skip: (Number(pageNo) - 1) * Number(pageSize) },
    { $limit: Number(pageSize) },
  ]);
}

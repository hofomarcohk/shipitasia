import { collections } from "@/cst/collections";
import { mongoAggregate, mongoCount } from "../utils/mongodb";

const collection = collections.ADMIN;

export async function aggregateAdmin(pipe: any) {
  return await mongoAggregate(collection, pipe);
}

export async function countAdmin(filter: any) {
  return await mongoCount(collection, filter);
}

export async function getAdminList(
  match: any,
  sort: any,
  pageNo: number,
  pageSize: number
) {
  return await aggregateAdmin([
    { $match: match },
    { $project: { _id: 0, password: 0 } },
    { $addFields: { isActive: { $eq: ["$status", "active"] } } },
    { $sort: sort },
    { $skip: (Number(pageNo) - 1) * Number(pageSize) },
    { $limit: Number(pageSize) },
  ]);
}

import { collections } from "@/cst/collections";
import { mongoAggregate, mongoGet } from "../utils/mongodb";

const collection = collections.CLIENT;

export async function getClientList(condition: any) {
  // hash the password
  return await mongoGet(collection, condition);
}

export async function aggregateClient(pipeline: any) {
  // hash the password
  return await mongoAggregate(collection, pipeline);
}

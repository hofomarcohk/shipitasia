import { collections } from "@/cst/collections";
import { IncomingApiLog } from "@/types/Log";
import { mongoAdd, mongoEdit } from "../utils/mongodb";

const collection = collections.INCOMING_API_LOG;

export async function addApiLog(data: IncomingApiLog) {
  data.createdAt = new Date();
  return await mongoAdd(collection, data);
}

export async function editApiLog(condition: any, data: IncomingApiLog) {
  return await mongoEdit(collection, condition, { $set: data });
}

export async function callApi() {}

import { collections } from "@/cst/collections";
import { IncomingApiLog } from "@/types/Log";
import { mongoAdd } from "../utils/mongodb";

const collection = collections.INCOMING_API_LOG;

export async function addIncomingApiLog(data: IncomingApiLog) {
  data.createdAt = new Date();
  return await mongoAdd(collection, data);
}

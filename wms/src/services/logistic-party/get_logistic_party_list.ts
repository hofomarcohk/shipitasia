import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.LOGISTIC_PARTY;

export async function getLogisticParty(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function countLogisticParty(filter: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(filter);
}

export async function getLogisticPartyMap(pipe: any) {
  return (await getLogisticParty(pipe)).reduce((acc: any, item: any) => {
    acc[item.logisticPartyCode] = item;
    return acc;
  }, {});
}

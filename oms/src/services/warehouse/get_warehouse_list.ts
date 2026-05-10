import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.WAREHOUSE;

export async function getWarehouse(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function getWarehouseMap(pipe: any) {
  return (await getWarehouse(pipe)).reduce((acc: any, warehouse: any) => {
    acc[warehouse.warehouseCode] = warehouse;
    return acc;
  }, {});
}

export async function countWarehouse(filter: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(filter);
}

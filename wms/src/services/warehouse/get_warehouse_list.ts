import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.WAREHOUSE;

export async function getWarehouse(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function countWarehouse(filter: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).countDocuments(filter);
}

export async function getWarehouseOptions() {
  return (
    await getWarehouse([
      { $match: { deletedAt: { $exists: false } } },
      {
        $project: { value: "$warehouseCode", label: "$warehouseCode" },
      },
      { $sort: { value: 1 } },
    ])
  ).map((item) => ({
    value: item.value,
    label: item.label,
  }));
}

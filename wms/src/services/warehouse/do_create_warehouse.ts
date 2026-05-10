import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Warehouse, warehouseSchema } from "@/types/Warehouse";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collection = collections.WAREHOUSE;

export async function createWarehouse(
  clientId: string,
  docs: Warehouse[]
) {
  const db = await connectToDatabase();
    docs.map((doc) => {
      doc.createdAt = new Date();
      doc.updatedAt = new Date();
      doc.createdBy = clientId;
      return warehouseSchema.parse(doc);
    });
  
    await db.collection(collection).insertMany(docs);
    await callShippingServiceApi(
      clientId,
      { method: "POST", url: `/api/wms/utils/sync` },
      { collection, docs }
    );
    return {};
}

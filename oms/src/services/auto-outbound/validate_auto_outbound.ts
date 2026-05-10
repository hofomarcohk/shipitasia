import { AutoOutbound, AutoOutboundSchema } from "@/types/AutoOutbound";
import { validateWarehouseCode } from "../warehouse/validate_warehouse";

export async function validateAutoOutbound(docs: AutoOutbound[]) {
  let warehouseCodes: string[] = [];
  docs.map((doc) => {
    warehouseCodes.push(doc.warehouseCode ?? "");
    AutoOutboundSchema.parse(doc);
  });
  await validateWarehouseCode(warehouseCodes);
}

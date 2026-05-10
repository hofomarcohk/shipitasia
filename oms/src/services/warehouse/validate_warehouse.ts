import { ApiError } from "@/app/api/api-error";
import { getWarehouseMap } from "./get_warehouse_list";

export async function validateWarehouseCode(warehouseCodes: string[]) {
  warehouseCodes = [...new Set(warehouseCodes)];
  const warehouseMap = await getWarehouseMap([
    {
      $match: {
        warehouseCode: { $in: warehouseCodes },
        deletedAt: { $exists: false },
      },
    },
  ]);
  const notFoundWarehouseCodes = warehouseCodes.filter(
    (code) => code !== "" && !warehouseMap[code]
  );
  if (notFoundWarehouseCodes.length > 0) {
    throw new ApiError("INVALID_WAREHOUSE", {
      code: notFoundWarehouseCodes.join(", "),
    });
  }
}

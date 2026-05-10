import { ApiError } from "@/app/api/api-error";
import { Inbound, InboundSchema } from "@/types/Inbound";
import { validateCategoryKey } from "../category/validate_category";
import { validateRestrictionKey } from "../restriction/validte_restriction";
import { validateWarehouseCode } from "../warehouse/validate_warehouse";
import { getInboundRequest } from "./get_inbound_order_list";

export async function validateInbound(clientId: string, docs: Inbound[]) {
  let warehouseCodes: string[] = [];
  let referenceNos: string[] = [];
  let restrictionTags: string[] = [];
  let categoryKeys: string[] = [];
  docs.map((doc) => {
    warehouseCodes.push(doc.warehouseCode ?? "");
    referenceNos.push(doc.referenceNo ?? "");
    restrictionTags = [...restrictionTags, ...(doc.restrictionTags ?? [])];
    categoryKeys = [...categoryKeys, ...(doc.category ?? [])];
    InboundSchema.parse(doc);
  });
  await validateInboundRefCode(clientId, referenceNos);
  await validateWarehouseCode(warehouseCodes);
  await validateRestrictionKey(restrictionTags);
  await validateCategoryKey(categoryKeys);
}

export async function validateInboundUpdate(doc: Partial<Inbound>) {
  let warehouseCodes: string[] = [];
  let restrictionTags: string[] = [];
  let categoryKeys: string[] = [];
  warehouseCodes.push(doc.warehouseCode ?? "");
  restrictionTags = [...restrictionTags, ...(doc.restrictionTags ?? [])];
  categoryKeys = [...categoryKeys, ...(doc.category ?? [])];
  InboundSchema.parse(doc);
  await validateWarehouseCode(warehouseCodes);
  await validateRestrictionKey(restrictionTags);
  await validateCategoryKey(categoryKeys);
}

export async function validateInboundRefCode(
  clientId: string,
  referenceNo: string[]
) {
  // check duplicated referenceNo
  let duplicatedReferenceNo: string[] = [];
  let referenceMap: {
    [key: string]: boolean;
  } = {};
  referenceNo.forEach((code) => {
    if (code === "") return;
    if (referenceMap[code]) {
      duplicatedReferenceNo.push(code);
    }
    referenceMap[code] = true;
  });
  if (duplicatedReferenceNo.length > 0) {
    duplicatedReferenceNo = [...new Set(duplicatedReferenceNo)];
    throw new ApiError("REPEAT_REF_NO", {
      code: duplicatedReferenceNo.join(", "),
    });
  }

  let existingReferenceNo = (
    await getInboundRequest([
      {
        $match: {
          clientId: clientId,
          referenceNo: { $in: referenceNo, $ne: "" },
          deletedAt: { $exists: false },
        },
      },
      {
        $project: {
          referenceNo: 1,
        },
      },
    ])
  )
    .map((item) => item.referenceNo as string)
    .filter((item: string) => item && referenceNo.includes(item));
  if (existingReferenceNo.length > 0) {
    existingReferenceNo = [...new Set(existingReferenceNo)];
    throw new ApiError("EXIST_REF_NO", {
      refNo: existingReferenceNo.join(", "),
    });
  }
}

import { ApiError } from "@/app/api/api-error";
import { Outbound, OutboundSchema } from "@/types/Outbound";
import { getInboundRequest } from "../inbonud-order/get_inbound_order_list";
import { validateLogisticPlatform } from "../logistic-party/validate-logistic-party";
import { validateWarehouseCode } from "../warehouse/validate_warehouse";
import { getOutboundRequest } from "./get_outbound_order_list";

export async function validateOutbound(clientId: string, docs: Outbound[]) {
  let warehouseCodes: string[] = [];
  let referenceNos: string[] = [];
  let inboundIdsMap: {
    [key: string]: string[];
  } = {};
  let logisticParties: string[] = [];

  docs.map((doc, i) => {
    const docKey = "data_" + i.toString();
    warehouseCodes.push(doc.warehouseCode ?? "");
    referenceNos.push(doc.referenceNo ?? "");
    inboundIdsMap[docKey] = doc.inboundRequestIds ?? [];
    logisticParties.push(doc.logisticParty ?? "");

    OutboundSchema.parse(doc);
  });
  await validateOutboundInbounds(clientId, inboundIdsMap);
  await validateLogisticPlatform(logisticParties);
  await validateOutboundRefCode(clientId, referenceNos);
  await validateWarehouseCode(warehouseCodes);
}

export async function validateOutboundUpdate(doc: Partial<Outbound>) {
  OutboundSchema.parse(doc);
  await validateLogisticPlatform([doc?.logisticParty ?? ""]);
}

export async function validateOutboundRefCode(
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
    await getOutboundRequest([
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

export async function validateOutboundInbounds(
  clientId: string,
  InboundIdListMap: {
    [key: string]: string[];
  }
) {
  // check duplicated referenceNo
  let duplicatedInboundId: string[] = [];
  let InboundIdMap: {
    [key: string]: boolean;
  } = {};
  let InboundIds: string[] = [];

  let missingInboundId: string[] = [];
  Object.keys(InboundIdListMap).forEach((key) => {
    const InboundIdList = InboundIdListMap[key];

    // check exists
    if (!InboundIdList || InboundIdList.length == 0) {
      missingInboundId.push(key);
    }

    // check duplicated
    InboundIdList.forEach((InboundId) => {
      if (InboundId === "") {
        missingInboundId.push(key);
      }

      if (InboundIdMap[InboundId]) {
        duplicatedInboundId.push(InboundId);
      }
      InboundIdMap[InboundId] = true;
      InboundIds.push(InboundId);
    });
  });

  if (missingInboundId.length > 0) {
    missingInboundId = [...new Set(missingInboundId)];
    throw new ApiError("MISSING_INBOUND_ID", {
      keys: missingInboundId.join(", "),
    });
  }

  if (duplicatedInboundId.length > 0) {
    duplicatedInboundId = [...new Set(duplicatedInboundId)];
    throw new ApiError("REPEAT_INBOUND_ID", {
      inboundIds: duplicatedInboundId.join(", "),
    });
  }

  // check if inbounds are valid
  let inboundMap = (
    await getInboundRequest([
      {
        $match: {
          orderId: { $in: InboundIds },
          clientId: clientId,
          deletedAt: { $exists: false },
        },
      },
      {
        $project: {
          orderId: 1,
          status: 1,
        },
      },
    ])
  ).reduce((acc, cur) => {
    acc[cur.orderId] = cur.status;
    return acc;
  }, {});

  console.log("inboundMap", {
    orderId: { $in: InboundIds },
    clientId: clientId,
    deletedAt: { $exists: false },
    inboundMap,
  });

  let invalidInboundIds: string[] = [];
  let notfoundInboundIds: string[] = [];
  InboundIds.forEach((InboundId) => {
    if (!inboundMap[InboundId]) {
      notfoundInboundIds.push(InboundId);
    }
    //if (inboundMap[InboundId] !== INBOUND.STATUS.INBOUNDED) {
    //  invalidInboundIds.push(InboundId);
    //}
  });

  if (notfoundInboundIds.length > 0) {
    notfoundInboundIds = [...new Set(notfoundInboundIds)];
    throw new ApiError("INBOUND_NOT_FOUND", {
      inboundIds: notfoundInboundIds.join(", "),
    });
  }

  if (invalidInboundIds.length > 0) {
    invalidInboundIds = [...new Set(invalidInboundIds)];
    throw new ApiError("INBOUND_NOT_OUTBOUNDABLE", {
      inboundIds: invalidInboundIds.join(", "),
    });
  }
}

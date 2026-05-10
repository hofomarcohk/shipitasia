import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { INBOUND as cstInbound } from "@/cst/inbound";
import { wmsApis } from "@/cst/wms-api";
import { connectToDatabase } from "@/lib/mongo";
import { Inbound, InboundRequestStatus } from "@/types/Inbound";
import { callWmsApi } from "../api/handle_wms_api";
import { newRecordId } from "../helpers/document";
import { validateInbound } from "./validate_inbound_order";

const collection = collections.INBOUND;

export async function createInbound(clientId: string, docs: Inbound[]) {
  const db = await connectToDatabase();

  // validate inbound request
  if (clientId.length === 0) {
    throw new ApiError("MISSING_FIELD", { field: "clientId" });
  }
  const now = new Date();
  docs = await Promise.all(
    docs.map(async (doc) => {
      doc.clientId = clientId;
      doc.orderId = await newRecordId(collection);
      doc.status = cstInbound.STATUS.PENDING as InboundRequestStatus;
      doc.source = doc.source ?? "api";
      doc.createdAt = now;
      doc.updatedAt = now;
      return doc;
    })
  );

  await validateInbound(clientId, docs);
  await callWmsApi(clientId, wmsApis.CREATE_INBOUND, {
    data: docs.map((doc) => {
      return {
        ...doc,
        referenceNo: doc.orderId,
      };
    }),
  });
  await db.collection(collection).insertMany(docs);
  return docs.map((doc) => {
    return {
      orderId: doc.orderId,
      referenceNo: doc.referenceNo,
    };
  });
}

import { collections } from "@/cst/collections";
import { INBOUND as cstInbound } from "@/cst/inbound";
import { wmsApis } from "@/cst/wms-api";
import { connectToDatabase } from "@/lib/mongo";
import { Inbound, InboundRequestStatus } from "@/types/Inbound";
import { randomUUID } from "crypto";
import { callWmsApi } from "../api/handle_wms_api";

const collection = collections.INBOUND;

export async function createInbound(clientId: string, docs: Inbound[]) {
  const db = await connectToDatabase();

  let referenceNo: string[] = [];

  docs.map((doc) => {
    doc.orderId = randomUUID();
    doc.clientId = clientId;
    doc.status = cstInbound.STATUS.PENDING as InboundRequestStatus;
    doc.createdAt = new Date();
    doc.updatedAt = new Date();

    if(doc.referenceNo && doc.referenceNo.length > 0) {
      if(referenceNo.includes(doc.referenceNo)){
        throw new Error("ReferenceNo is duplicated");
      }  
    referenceNo.push(doc.referenceNo || "");
    }
  });

  await callWmsApi(clientId, wmsApis.CREATE_INBOUND, {data: docs.map(
    (doc) => {
      return {
        ...doc,
        referenceNo: doc.orderId,
      }
    }
  )});
  await db.collection(collection).insertMany(docs);
  return docs.map(
    (doc) => {
      return {
        orderId: doc.orderId,
        referenceNo: doc.referenceNo,
      }
    }
  );
}

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { INBOUND as cstInbound } from "@/cst/inbound";
import { OUTBOUND as cstOutbound } from "@/cst/outbound";
import { wmsApis } from "@/cst/wms-api";
import { connectToDatabase } from "@/lib/mongo";
import { InboundRequestStatus } from "@/types/Inbound";
import { Outbound, OutboundRequestStatus } from "@/types/Outbound";
import { callWmsApi } from "../api/handle_wms_api";
import { newRecordId } from "../helpers/document";
import { validateOutbound } from "./validate_outbound_order";

const collection = collections.OUTBOUND;

export async function createOutbound(clientId: string, docs: Outbound[]) {
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
      doc.status = cstOutbound.STATUS.PENDING as OutboundRequestStatus;
      doc.source = doc.source ?? "api";
      doc.createdAt = now;
      doc.updatedAt = now;
      return doc;
    })
  );

  await validateOutbound(clientId, docs);
  await callWmsApi(clientId, wmsApis.CREATE_OUTBOUND, {
    data: docs.map((doc) => {
      return {
        ...doc,
        referenceNo: doc.orderId,
      };
    }),
  });
  await db.collection(collection).insertMany(docs);

  // update inbound status
  await db.collection(collections.INBOUND).updateMany(
    {
      clientId,
      // status: cstInbound.STATUS.INBOUNDED,
      orderId: {
        $in: docs.reduce((acc: string[], cur: Outbound) => {
          acc = acc.concat(cur.inboundRequestIds ?? []);
          return acc;
        }, []),
      },
    },
    {
      $set: {
        status: cstInbound.STATUS.SCHEDULED as InboundRequestStatus,
      },
    }
  );

  return docs.map((doc) => {
    return {
      orderId: doc.orderId,
      referenceNo: doc.referenceNo,
    };
  });
}

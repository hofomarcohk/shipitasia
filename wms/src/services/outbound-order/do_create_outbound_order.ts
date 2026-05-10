import { collections } from "@/cst/collections";
import { OUTBOUND as cstOutbound } from "@/cst/outbound";
import { connectToDatabase } from "@/lib/mongo";
import { Inbound, InboundSchema } from "@/types/Inbound";
import { OutboundRequestStatus } from "@/types/Outbound";
import { newRecordId } from "../helpers/document";

const collection = collections.OUTBOUND;

export async function createOutbound(clientId: string, docs: Inbound[]) {
  const db = await connectToDatabase();
  docs.map(async (doc) => {
    doc.orderId = doc.referenceNo ?? (await newRecordId(collection));
    if (clientId) {
      doc.clientId = clientId;
    }
    doc.status = cstOutbound.STATUS.PENDING as OutboundRequestStatus;
    doc.createdAt = new Date();
    doc.updatedAt = new Date();
    return InboundSchema.parse(doc);
  });

  await db.collection(collection).insertMany(docs);
  return docs.map((doc) => {
    return {
      orderId: doc.orderId,
      referenceNo: doc.referenceNo,
    };
  });
}

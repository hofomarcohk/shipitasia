import { collections } from "@/cst/collections";
import { INBOUND as cstInbound } from "@/cst/inbound";
import { connectToDatabase } from "@/lib/mongo";
import { Inbound, InboundRequestStatus, InboundSchema } from "@/types/Inbound";
import { newRecordId } from "../helpers/document";

const collection = collections.INBOUND;

export async function createInbound(clientId: string, docs: Inbound[]) {
  const db = await connectToDatabase();
  docs.map(async (doc) => {
    doc.orderId = doc.referenceNo ?? (await newRecordId(collection));
    if (clientId.length > 0) {
      doc.clientId = clientId;
    }
    doc.status = cstInbound.STATUS.PENDING as InboundRequestStatus;
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

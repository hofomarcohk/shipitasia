import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { AutoOutbound } from "@/types/AutoOutbound";
import { newRecordId } from "../helpers/document";
import { validateAutoOutbound } from "./validate_auto_outbound";

const collection = collections.AUTO_OUTBOUND_SETTING;

export async function createAutoOutbound(
  clientId: string,
  docs: AutoOutbound[]
) {
  const db = await connectToDatabase();

  // validate inbound request
  if (clientId.length === 0) {
    throw new ApiError("MISSING_FIELD", { field: "clientId" });
  }
  const now = new Date();
  docs = await Promise.all(
    docs.map(async (doc) => {
      doc.recordId = await newRecordId(collection);
      doc.clientId = clientId;
      doc.isActive = doc.isActive ?? false;
      doc.createdAt = now;
      doc.updatedAt = now;
      return doc;
    })
  );
  validateAutoOutbound(docs);

  await db.collection(collection).insertMany(docs);
}

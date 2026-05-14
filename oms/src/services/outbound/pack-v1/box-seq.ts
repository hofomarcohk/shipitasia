import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

/**
 * Per-client monotonic counter for box numbering. Atomically increments and
 * returns the next sequence integer.
 */
export async function nextBoxSeq(client_id: string): Promise<number> {
  const db = await connectToDatabase();
  const result = await db
    .collection(collections.BOX_SEQ)
    .findOneAndUpdate(
      { _id: client_id as any },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );
  const doc = (result as any)?.value ?? result;
  return (doc?.seq as number) ?? 1;
}

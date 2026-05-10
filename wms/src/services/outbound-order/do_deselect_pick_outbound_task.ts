import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collectionPickList = collections.PICK_LIST;
const collectionOutbound = collections.OUTBOUND;

export async function deselectPickOutboundTask(staff: string, orderId: string) {
  const db = await connectToDatabase();
  const updatedAt = new Date();
  const updatedBy = staff;
  await db.collection(collectionOutbound).updateOne(
    { orderId },
    {
      $set: {
        updatedAt,
        updatedBy,
      },
    }
  );

  await db.collection(collectionPickList).updateMany({ orderId }, [
    {
      $set: {
        updatedAt,
        staffs: {
          $filter: {
            input: "$staffs",
            cond: { $ne: ["$$this", staff] },
          },
        },
      },
    },
  ]);
}

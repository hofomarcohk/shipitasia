import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

export type WeighPalletizeAuditAction =
  | "weigh.save_box"
  | "weigh.advance_status"
  | "palletize.start_session"
  | "palletize.scan_box"
  | "palletize.complete"
  | "palletize.cancel_session";

export async function writeWeighPalletizeAudit(
  staff: string,
  action: WeighPalletizeAuditAction,
  details: Record<string, unknown>
) {
  const db = await connectToDatabase();
  const now = new Date();
  await db.collection(collections.PACK_LOG_V1).insertOne({
    action,
    staff,
    details,
    createdAt: now,
  });
  await db.collection(collections.AUDIT_LOG).insertOne({
    actor_type: "staff",
    actor_id: staff,
    action,
    details,
    createdAt: now,
  });
}

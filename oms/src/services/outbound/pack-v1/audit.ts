import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

export type PackAuditAction =
  | "pack.scan"
  | "pack.open_box"
  | "pack.place_item"
  | "pack.swap_item"
  | "pack.cancel_box"
  | "pack.seal_box"
  | "pack.print_box_label";

export async function writePackAudit(
  staff: string,
  action: PackAuditAction,
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

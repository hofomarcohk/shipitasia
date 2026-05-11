import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

/**
 * Phase 4 spec §1.8 / §2.7: notifications are written from any phase that
 * produces a client-facing event. UI to display them is deferred to a
 * later phase; for v1 we write rows + (optional) email via Resend.
 *
 * Adding a new type: extend NOTIFICATION_TYPES + the body builder; the
 * collection itself doesn't constrain the string.
 */
export const NOTIFICATION_TYPES = [
  // P4
  "inbound_created",
  "inbound_updated",
  "inbound_cancelled",
  "inbound_abandoned",
  // P5+ (reserve so callers can use them when their phases land)
  "inbound_arrived",
  "inbound_received",
  "inbound_anomaly_detected",
  "inbound_status_adjusted",
  "inbound_arrive_cancelled",
  // P6
  "inbound_unclaimed_assigned",
  "inbound_unclaimed_assignment_cancelled",
  // P7
  "outbound_created",
  "outbound_held_insufficient_balance",
  "outbound_held_released",
  "outbound_cancelled",
  "outbound_pending_client_label",
  "outbound_label_obtained",
  "outbound_departed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface CreateNotificationInput {
  client_id: string;
  type: NotificationType;
  title: string;
  body: string;
  reference_type?: string;
  reference_id?: string;
  action_url?: string;
}

/**
 * Write a notification row. Returns the inserted id so callers can link
 * (e.g. wallet_transactions.metadata.notification_id).
 *
 * NOTE: v1 doesn't auto-send email — most P4 events don't warrant a mail.
 * Phases that want email (P3 topup approve, P6 unclaimed assigned) call
 * sendEmail() in their own service explicitly. Keeps this helper cheap
 * and synchronous so it can sit inside a mongo session transaction.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<{ notification_id: string }> {
  const db = await connectToDatabase();
  const now = new Date();
  const ins = await db.collection(collections.NOTIFICATION).insertOne({
    client_id: input.client_id,
    type: input.type,
    title: input.title,
    body: input.body,
    reference_type: input.reference_type ?? null,
    reference_id: input.reference_id ?? null,
    action_url: input.action_url ?? null,
    is_read: false,
    read_at: null,
    createdAt: now,
  } as any);
  return { notification_id: ins.insertedId.toString() };
}

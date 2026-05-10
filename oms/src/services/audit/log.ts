import { connectToDatabase } from "@/lib/mongo";
import { collections } from "@/cst/collections";
import {
  AuditAction,
  AuditActorType,
  AuditTargetType,
} from "@/constants/auditActions";

export interface AuditLogInput {
  action: AuditAction;
  actor_type: AuditActorType;
  actor_id: string | null;
  target_type: AuditTargetType;
  target_id: string;
  details?: Record<string, unknown>;
  warehouse_code?: string;
  ip_address?: string;
  user_agent?: string;
}

export interface AuditLogRecord extends Required<Pick<AuditLogInput, "action" | "actor_type" | "target_type" | "target_id">> {
  actor_id: string | null;
  details: Record<string, unknown>;
  warehouse_code: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

/**
 * Append a structured audit log entry. Append-only: never updates existing rows.
 * All business actions across phases must call this — no direct collection writes
 * to audit_logs from elsewhere (review.md §6.1).
 *
 * Failure mode: throws. Callers decide whether to absorb (e.g. don't fail user
 * action just because audit write failed) — but the default expectation is that
 * audit lives inside the same mongo session as the business write so they
 * commit together.
 */
export async function logAudit(input: AuditLogInput): Promise<void> {
  const db = await connectToDatabase();
  const record: AuditLogRecord = {
    action: input.action,
    actor_type: input.actor_type,
    actor_id: input.actor_id ?? null,
    target_type: input.target_type,
    target_id: input.target_id,
    details: input.details ?? {},
    warehouse_code: input.warehouse_code ?? null,
    ip_address: input.ip_address ?? null,
    user_agent: input.user_agent ?? null,
    created_at: new Date(),
  };
  await db.collection(collections.AUDIT_LOG).insertOne(record);
}

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { ApiError } from "@/app/api/api-error";

/**
 * Atomic per-day counter. Used by Phase 4 inbound (I-…) + Phase 5 scan (S…)
 * + Phase 5 unclaimed (U-…) + Phase 7 outbound (OUT-…) + Phase 8 box (B-…).
 *
 * Format: <prefix>-<YYYYMMDD>-<NNNN>
 *
 * MongoDB `findOneAndUpdate($inc)` is atomic, so two concurrent requests
 * cannot collide on the same NNNN.
 */
export async function nextDailyId(
  prefix: string,
  date: Date = new Date()
): Promise<string> {
  const dateStr = formatYYYYMMDD(date);
  const counterKey = `${prefix}_${dateStr}`;
  const db = await connectToDatabase();
  const result = await db
    .collection(collections.DAILY_COUNTER)
    .findOneAndUpdate(
      { _id: counterKey as any },
      { $inc: { counter: 1 }, $set: { last_used_at: new Date() } },
      { upsert: true, returnDocument: "after" }
    );
  // mongo driver v6 returns the doc directly; v5 wrapped in {value}.
  const doc =
    (result && (result as any).value !== undefined ? (result as any).value : result) as
      | { counter: number }
      | null;
  const counter = doc?.counter ?? 1;
  if (counter > 9999) {
    // Cap at 4 digits so the ID stays stable width; admin can migrate to
    // 5 digits if business actually outgrows 9999 docs/day.
    throw new ApiError("DAILY_COUNTER_EXCEEDED");
  }
  const nnnn = String(counter).padStart(4, "0");
  return `${prefix}-${dateStr}-${nnnn}`;
}

function formatYYYYMMDD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

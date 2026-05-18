// P15 working-day arithmetic for the managed_consign SLA. The cron uses
// these helpers to decide whether a group's 3-working-day window has
// elapsed.
//
// Source of truth: `working_calendars` collection — per-warehouse rows with
// `date` (YYYY-MM-DD) and `type=holiday|non_working`. When the table is
// empty for a warehouse, the helpers fall back to Mon-Fri = working,
// Sat-Sun = non-working. The P16 admin UI populates the table.

import { collections } from "@/cst/collections";

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

async function loadNonWorkingDays(
  db: any,
  warehouseCode: string,
  from: Date,
  to: Date
): Promise<Set<string>> {
  const rows = await db
    .collection(collections.WORKING_CALENDAR)
    .find({
      warehouseCode,
      date: { $gte: ymd(from), $lte: ymd(to) },
    })
    .toArray();
  return new Set(rows.map((r: any) => r.date as string));
}

function isWeekend(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6;
}

// Return the date that is `n` working days after `start`. Working days do
// not include the start date itself — addWorkingDays(Mon, 3) is Thu (Tue,
// Wed, Thu are the 3 working days).
export async function addWorkingDays(
  db: any,
  warehouseCode: string,
  start: Date,
  n: number
): Promise<Date> {
  if (n <= 0) return startOfUtcDay(start);
  // Worst case the next n working days span n * 3 calendar days (long
  // holiday weekends). Add a small buffer so the lookup window covers it.
  const lookAheadDays = Math.max(7, n * 3 + 7);
  const startDay = startOfUtcDay(start);
  const lookEnd = new Date(startDay.getTime() + lookAheadDays * 86_400_000);
  const nonWorking = await loadNonWorkingDays(
    db,
    warehouseCode,
    startDay,
    lookEnd
  );
  let cursor = startDay;
  let remaining = n;
  // Safety cap so a misconfigured calendar can't spin forever.
  for (let i = 0; i < 365 && remaining > 0; i++) {
    cursor = new Date(cursor.getTime() + 86_400_000);
    if (isWeekend(cursor)) continue;
    if (nonWorking.has(ymd(cursor))) continue;
    remaining--;
  }
  return cursor;
}

// Convenience for the cron: has the SLA window elapsed?
export async function hasSlaElapsed(
  db: any,
  warehouseCode: string,
  oldestReceivedAt: Date,
  workingDays: number,
  now: Date = new Date()
): Promise<boolean> {
  const deadline = await addWorkingDays(
    db,
    warehouseCode,
    oldestReceivedAt,
    workingDays
  );
  return now.getTime() >= deadline.getTime();
}

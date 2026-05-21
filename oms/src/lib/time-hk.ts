// P17 — Hong Kong local-time helpers for day-boundary math.
//
// WMS scheduled jobs (YT daily-outbound rollover, unclaimed-pool
// abandonment scan) anchor to the warehouse calendar day, not UTC. v1
// hard-codes Asia/Hong_Kong since ShipItAsia's active warehouses are
// HK + JP-HK pipeline. When per-warehouse timezones land, expose a
// withTimezone(tz) variant — the call sites already accept a Date so
// no further surface change.
//
// All return values are JS Date objects in UTC absolute time; the
// "HK" naming reflects which day-boundary they snap to.

export const WAREHOUSE_TIMEZONE = "Asia/Hong_Kong" as const;

// HK is fixed UTC+8 (no DST). We use the offset directly rather than
// Intl.DateTimeFormat parsing — simpler, allocation-free, and accurate
// because HK has no daylight saving.
const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Start of the HK calendar day containing `d` (defaults to now).
 * Returns a Date whose UTC value equals 16:00 of the previous UTC day.
 */
export function startOfHkDay(d: Date = new Date()): Date {
  const hkEpoch = d.getTime() + HK_OFFSET_MS;
  const dayFloor = Math.floor(hkEpoch / 86_400_000) * 86_400_000;
  return new Date(dayFloor - HK_OFFSET_MS);
}

/**
 * End of the HK calendar day containing `d` (inclusive). 23:59:59.999 HK.
 */
export function endOfHkDay(d: Date = new Date()): Date {
  return new Date(startOfHkDay(d).getTime() + 86_400_000 - 1);
}

/**
 * `d` shifted by `days` HK-calendar-days. Used to compute age thresholds
 * (e.g. arrived_at + 30 HK-days → comparison anchor).
 */
export function addHkDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/**
 * Whole HK-calendar-days between two timestamps. Negative if `then` is
 * after `now`. Floor-rounded so a parcel arrived 29.9 days ago counts
 * as 29 — matches the conservative "wait until full day elapses" rule.
 */
export function hkDaysBetween(then: Date, now: Date = new Date()): number {
  const a = startOfHkDay(then).getTime();
  const b = startOfHkDay(now).getTime();
  return Math.floor((b - a) / 86_400_000);
}

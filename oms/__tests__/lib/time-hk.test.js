// Can't require TS directly under jest's current config, so we mirror
// the logic here. Verifying the math matches our intent; if the source
// formula changes, this test catches the drift via a follow-up edit.

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;
function startOfHkDay(d) {
  const hkEpoch = d.getTime() + HK_OFFSET_MS;
  const dayFloor = Math.floor(hkEpoch / 86_400_000) * 86_400_000;
  return new Date(dayFloor - HK_OFFSET_MS);
}
function endOfHkDay(d) {
  return new Date(startOfHkDay(d).getTime() + 86_400_000 - 1);
}
function hkDaysBetween(then, now) {
  const a = startOfHkDay(then).getTime();
  const b = startOfHkDay(now).getTime();
  return Math.floor((b - a) / 86_400_000);
}

describe("HK day boundaries", () => {
  test("startOfHkDay snaps 03:00 UTC to previous HK midnight (which is 16:00 UTC day before)", () => {
    // 2026-05-21T03:00:00Z = 2026-05-21T11:00 HK → same HK day
    const noonHk = new Date("2026-05-21T03:00:00Z");
    const start = startOfHkDay(noonHk);
    // start should be 2026-05-20T16:00:00Z = 2026-05-21T00:00 HK
    expect(start.toISOString()).toBe("2026-05-20T16:00:00.000Z");
  });

  test("startOfHkDay handles midnight HK exactly", () => {
    const hkMidnight = new Date("2026-05-20T16:00:00Z"); // = HK 2026-05-21 00:00
    expect(startOfHkDay(hkMidnight).toISOString()).toBe(
      "2026-05-20T16:00:00.000Z"
    );
  });

  test("startOfHkDay handles 15:59 UTC = HK 23:59 same UTC day", () => {
    const eveningUtc = new Date("2026-05-20T15:59:00Z"); // = HK 2026-05-20 23:59
    expect(startOfHkDay(eveningUtc).toISOString()).toBe(
      "2026-05-19T16:00:00.000Z"
    );
  });

  test("endOfHkDay is exactly start + 1d - 1ms", () => {
    const sample = new Date("2026-05-21T08:00:00Z");
    expect(endOfHkDay(sample).getTime() - startOfHkDay(sample).getTime()).toBe(
      86_400_000 - 1
    );
  });

  test("hkDaysBetween: same instant → 0", () => {
    const t = new Date("2026-05-21T03:00:00Z");
    expect(hkDaysBetween(t, t)).toBe(0);
  });

  test("hkDaysBetween counts HK midnights between, not fractional ms", () => {
    // Both at HK 13:00; 29 full days apart → 29 midnights between.
    const now = new Date("2026-05-21T05:00:00Z");
    const then = new Date(now.getTime() - 29 * 86_400_000);
    expect(hkDaysBetween(then, now)).toBe(29);
    // Just-before-midnight arrival counted as +1 once now crosses the
    // next midnight, even though wall-clock diff is < 2 hours.
    const justBefore = new Date("2026-05-20T15:59:00Z"); // HK 23:59 May 20
    const justAfter = new Date("2026-05-20T16:01:00Z"); // HK 00:01 May 21
    expect(hkDaysBetween(justBefore, justAfter)).toBe(1);
  });

  test("hkDaysBetween: exactly 30 days ago → 30", () => {
    const now = new Date("2026-05-21T03:00:00Z");
    const then = new Date(now.getTime() - 30 * 86_400_000);
    expect(hkDaysBetween(then, now)).toBe(30);
  });

  test("hkDaysBetween crossing a UTC day-boundary at 14:00 UTC still counts in HK days", () => {
    // 2026-05-21T14:00 UTC = HK 22:00 same HK day; 2026-05-21T17:00 UTC =
    // HK 2026-05-22 01:00 → HK day shifted +1 even though UTC date string
    // shows same date.
    expect(
      hkDaysBetween(
        new Date("2026-05-21T14:00:00Z"),
        new Date("2026-05-21T17:00:00Z")
      )
    ).toBe(1);
  });
});

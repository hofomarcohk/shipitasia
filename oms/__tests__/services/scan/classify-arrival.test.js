const {
  classifyArrival,
} = require("../../../src/services/scan/classify-arrival");

const matched = { matched: true, inbound: { _id: "I-x", client_id: "C-1" } };
const unmatched = { matched: false };

describe("classifyArrival", () => {
  test("YT prefix wins even when a forecast exists", () => {
    // Defensive: per spec YT shouldn't have a forecast, but if it ever
    // happens the YT prefix is authoritative.
    expect(classifyArrival("YT12345", matched)).toBe("yt");
  });

  test("YT prefix with no lookup → yt", () => {
    expect(classifyArrival("YT-2026-0001", unmatched)).toBe("yt");
    expect(classifyArrival("YT9", null)).toBe("yt");
    expect(classifyArrival("YT9", undefined)).toBe("yt");
  });

  test("non-YT + matched lookup → forecasted", () => {
    expect(classifyArrival("RR123456789CN", matched)).toBe("forecasted");
    expect(classifyArrival("1Z999AA10123456784", matched)).toBe("forecasted");
  });

  test("non-YT + unmatched lookup → unclaimed", () => {
    expect(classifyArrival("RR123456789CN", unmatched)).toBe("unclaimed");
    expect(classifyArrival("RR123", null)).toBe("unclaimed");
  });

  test("lowercase yt is NOT classified as yt (mirrors isYTTracking strictness)", () => {
    expect(classifyArrival("yt123", matched)).toBe("forecasted");
    expect(classifyArrival("yt123", unmatched)).toBe("unclaimed");
  });

  test("empty / non-string tracking falls back on lookup", () => {
    expect(classifyArrival("", matched)).toBe("forecasted");
    expect(classifyArrival("", unmatched)).toBe("unclaimed");
    expect(classifyArrival(null, unmatched)).toBe("unclaimed");
    expect(classifyArrival(undefined, matched)).toBe("forecasted");
  });
});

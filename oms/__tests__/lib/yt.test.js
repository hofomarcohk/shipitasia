const { isYTTracking } = require("../../src/lib/yt");

describe("isYTTracking", () => {
  test.each([
    ["YT123456", true],
    ["YT", true],
    ["YT-2026-001", true],
    ["  YT12345  ", true], // scanner whitespace
    ["yt123", false], // lowercase rejected — printed labels are uppercase
    ["Yt123", false],
    ["ZYT123", false], // not at start
    ["XYT123", false],
    ["", false],
    ["123YT", false],
    [null, false],
    [undefined, false],
    [12345, false],
    [{ tracking_no: "YT123" }, false],
  ])("isYTTracking(%p) -> %p", (input, expected) => {
    expect(isYTTracking(input)).toBe(expected);
  });
});

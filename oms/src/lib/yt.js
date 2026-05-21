// P17 — YT tracking-number detection.
//
// Authored as JS (with JSDoc types) so the existing jest harness can
// require it directly without a TS transform. TS consumers still get
// inference via tsconfig allowJs.
//
// Spec — per the YT-flow business rules:
//   - Tracking numbers belonging to the YT flow begin with the literal
//     uppercase prefix "YT".
//   - Scanners may emit stray whitespace; we trim before matching.
//   - Match is case-sensitive uppercase. Printed YT labels are always
//     uppercase; lowercase / mixed case is treated as not-YT to avoid
//     false-positives on customer-supplied tracking numbers that
//     happen to contain "yt" elsewhere.

/**
 * @param {unknown} trackingNo
 * @returns {boolean}
 */
function isYTTracking(trackingNo) {
  if (typeof trackingNo !== "string") return false;
  return trackingNo.trim().startsWith("YT");
}

module.exports = { isYTTracking };

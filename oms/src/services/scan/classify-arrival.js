// P17 — S2 arrival classifier.
//
// Given a scanned tracking number plus the result of arriveLookup(), decide
// which of the three S2 buckets the parcel falls into. This is a pure
// function so it's safe to call from both API routes and PDA UI render
// helpers.
//
// Buckets:
//   - "yt"          — tracking_no starts with YT prefix. Always takes
//                     precedence over forecast lookup; YT parcels are not
//                     supposed to have OMS forecasts.
//   - "forecasted"  — lookup matched (consolidated, managed_consign, or
//                     single_direct — any shipping_mode); proceed with the
//                     normal arrive + upshelve flow on the inbound row.
//   - "unclaimed"   — lookup did not match and not YT; parcel drops into
//                     the unclaimed pool and is upshelved there until a
//                     client (U3.1) or CS (U3.2) claims it.
//
// Authored as JS (with JSDoc types) so jest can test it directly without
// a TS transform.

const { isYTTracking } = require("../../lib/yt");

/**
 * @typedef {"yt" | "forecasted" | "unclaimed"} ArrivalBucket
 */

/**
 * @typedef {{ matched: true, inbound: object } | { matched: false }} ArriveLookupResult
 */

/**
 * @param {unknown} trackingNo
 * @param {ArriveLookupResult | null | undefined} lookup
 * @returns {ArrivalBucket}
 */
function classifyArrival(trackingNo, lookup) {
  if (isYTTracking(trackingNo)) return "yt";
  if (lookup && lookup.matched === true) return "forecasted";
  return "unclaimed";
}

module.exports = { classifyArrival };

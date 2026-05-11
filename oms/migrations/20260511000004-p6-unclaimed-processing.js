// Phase 6 — extend unclaimed_inbounds (assignment_history) and
// inbound_requests (from_unclaimed_id + source) + index for the
// per-client "待確認" tab query.

module.exports = {
  async up(db) {
    // Per-client pending-confirm query: matches unclaimed where the latest
    // assignment_history entry has client_id=X and no accept/reject/cancel.
    // Multi-key index supports the elemMatch pattern.
    await db
      .collection("unclaimed_inbounds")
      .createIndex(
        {
          "assignment_history.client_id": 1,
          "assignment_history.accepted_at": 1,
          "assignment_history.rejected_at": 1,
          "assignment_history.cancelled_at": 1,
        },
        { name: "unclaimed_assignment_lookup" }
      );

    await db
      .collection("inbound_requests")
      .createIndex(
        { from_unclaimed_id: 1 },
        {
          name: "inbound_from_unclaimed",
          partialFilterExpression: { from_unclaimed_id: { $exists: true } },
        }
      );
  },

  async down(db) {
    await db
      .collection("unclaimed_inbounds")
      .dropIndex("unclaimed_assignment_lookup")
      .catch(() => {});
    await db
      .collection("inbound_requests")
      .dropIndex("inbound_from_unclaimed")
      .catch(() => {});
  },
};

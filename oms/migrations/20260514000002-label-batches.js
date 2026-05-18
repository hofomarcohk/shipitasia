// P13 — label batches (合併取單). One label_batches doc per client request
// to the carrier that grouped multiple outbounds in a single fetchLabel call.
// Each outbound in the batch keeps its own SHP# (tracking_no) and per-box
// label_pdf_path; label_batch_id links them so WMS can group them physically
// at handover.

module.exports = {
  async up(db) {
    await db
      .collection("label_batches")
      .createIndex(
        { client_id: 1, createdAt: -1 },
        { name: "lb_client_recent" }
      );
    await db
      .collection("label_batches")
      .createIndex(
        { warehouseCode: 1, status: 1, createdAt: -1 },
        { name: "lb_wh_status_recent" }
      );
    await db
      .collection("label_batches")
      .createIndex(
        { outbound_ids: 1 },
        {
          name: "lb_outbound_lookup",
          partialFilterExpression: { outbound_ids: { $exists: true } },
        }
      );

    // Optional secondary index on outbounds to find sibling outbounds
    // sharing the same batch quickly.
    await db
      .collection("outbound_requests")
      .createIndex(
        { label_batch_id: 1 },
        {
          name: "ob_label_batch_id",
          partialFilterExpression: { label_batch_id: { $exists: true } },
        }
      );
  },

  async down(db) {
    await db
      .collection("label_batches")
      .dropIndex("lb_client_recent")
      .catch(() => {});
    await db
      .collection("label_batches")
      .dropIndex("lb_wh_status_recent")
      .catch(() => {});
    await db
      .collection("label_batches")
      .dropIndex("lb_outbound_lookup")
      .catch(() => {});
    await db
      .collection("outbound_requests")
      .dropIndex("ob_label_batch_id")
      .catch(() => {});
  },
};

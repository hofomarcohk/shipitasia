// Phase 10 — WMS pick batch (wave) + pallet label.
//
// Creates indexes for pick_batches (warehouse-scoped active lookup),
// pallet_labels (pallet_no unique, outbound lookup, scan-back fast path).
// No backfill — new outbounds going forward may carry batch_id /
// disallow_consolidation / cargo_categories; legacy outbounds stay null.

module.exports = {
  async up(db) {
    // ── pick_batches ─────────────────────────────────────────
    await db
      .collection("pick_batches")
      .createIndex(
        { warehouseCode: 1, status: 1, createdAt: -1 },
        { name: "pb_wh_status_recent" }
      );
    await db
      .collection("pick_batches")
      .createIndex(
        { status: 1, createdAt: -1 },
        { name: "pb_status_recent" }
      );
    await db
      .collection("pick_batches")
      .createIndex(
        { batch_no: 1 },
        { name: "pb_batch_no_unique", unique: true }
      );
    await db
      .collection("pick_batches")
      .createIndex(
        { outbound_ids: 1 },
        {
          name: "pb_outbound_lookup",
          partialFilterExpression: { outbound_ids: { $exists: true } },
        }
      );

    // ── pallet_labels ────────────────────────────────────────
    await db
      .collection("pallet_labels")
      .createIndex(
        { pallet_no: 1 },
        { name: "pl_pallet_no_unique", unique: true }
      );
    await db
      .collection("pallet_labels")
      .createIndex(
        { outbound_id: 1, printed_at: -1 },
        { name: "pl_outbound_recent" }
      );
    await db
      .collection("pallet_labels")
      .createIndex(
        { batch_id: 1, printed_at: -1 },
        {
          name: "pl_batch_recent",
          partialFilterExpression: { batch_id: { $type: "string" } },
        }
      );
    await db
      .collection("pallet_labels")
      .createIndex(
        { client_id: 1, scanned_back_at: 1 },
        { name: "pl_client_scanstate" }
      );

    // ── outbound_requests: batch lookup ──────────────────────
    await db
      .collection("outbound_requests")
      .createIndex(
        { batch_id: 1 },
        {
          name: "ob_batch_lookup",
          partialFilterExpression: { batch_id: { $type: "string" } },
        }
      );

    // ── outbound_boxes: pallet label lookup ──────────────────
    await db
      .collection("outbound_boxes")
      .createIndex(
        { pallet_label_id: 1 },
        {
          name: "obx_pallet_lookup",
          partialFilterExpression: { pallet_label_id: { $type: "string" } },
        }
      );
  },

  async down(db) {
    const drops = [
      ["pick_batches", "pb_wh_status_recent"],
      ["pick_batches", "pb_status_recent"],
      ["pick_batches", "pb_batch_no_unique"],
      ["pick_batches", "pb_outbound_lookup"],
      ["pallet_labels", "pl_pallet_no_unique"],
      ["pallet_labels", "pl_outbound_recent"],
      ["pallet_labels", "pl_batch_recent"],
      ["pallet_labels", "pl_client_scanstate"],
      ["outbound_requests", "ob_batch_lookup"],
      ["outbound_boxes", "obx_pallet_lookup"],
    ];
    for (const [col, idx] of drops) {
      await db.collection(col).dropIndex(idx).catch(() => {});
    }
  },
};

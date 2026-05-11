// Phase 8 — WMS outbound flow (pick / pack / weigh / depart).
// Creates indexes for outbound_boxes (box_no unique + tracking lookup),
// box_inbound_links (active link guard per inbound), outbound_box_weights
// (per-box one-row replaceable record), outbound_scans (append-only WMS
// audit), and extends outbound_requests with status-progression indexes.

module.exports = {
  async up(db) {
    // ── outbound_boxes ───────────────────────────────────────
    await db
      .collection("outbound_boxes")
      .createIndex(
        { outbound_id: 1, status: 1 },
        { name: "obx_outbound_status" }
      );
    await db
      .collection("outbound_boxes")
      .createIndex({ box_no: 1 }, { name: "obx_box_no_unique", unique: true });
    await db
      .collection("outbound_boxes")
      .createIndex(
        { tracking_no_carrier: 1 },
        {
          name: "obx_tracking_unique",
          partialFilterExpression: {
            tracking_no_carrier: { $type: "string" },
          },
        }
      );

    // ── box_inbound_links ────────────────────────────────────
    // Per inbound there can be at most one active link (unlinked_at=null);
    // history rows have unlinked_at populated so they don't collide.
    await db
      .collection("box_inbound_links")
      .createIndex(
        { inbound_id: 1 },
        {
          name: "bil_active_inbound_unique",
          unique: true,
          partialFilterExpression: { unlinked_at: null },
        }
      );
    await db
      .collection("box_inbound_links")
      .createIndex(
        { box_id: 1, inbound_id: 1 },
        { name: "bil_box_inbound" }
      );
    await db
      .collection("box_inbound_links")
      .createIndex(
        { outbound_id: 1, linked_at: -1 },
        { name: "bil_outbound_recent" }
      );

    // ── outbound_box_weights ─────────────────────────────────
    // One weight record per box (replaceable). Use upsert-by-box_id pattern.
    await db
      .collection("outbound_box_weights")
      .createIndex(
        { box_id: 1 },
        { name: "obw_box_unique", unique: true }
      );
    await db
      .collection("outbound_box_weights")
      .createIndex(
        { outbound_id: 1, weighed_at: -1 },
        { name: "obw_outbound_recent" }
      );

    // ── outbound_scans (append-only) ─────────────────────────
    await db
      .collection("outbound_scans")
      .createIndex(
        { outbound_id: 1, createdAt: -1 },
        { name: "osc_outbound_recent" }
      );
    await db
      .collection("outbound_scans")
      .createIndex(
        { inbound_id: 1, createdAt: -1 },
        {
          name: "osc_inbound_recent",
          partialFilterExpression: { inbound_id: { $type: "string" } },
        }
      );
    await db
      .collection("outbound_scans")
      .createIndex(
        { box_id: 1, createdAt: -1 },
        {
          name: "osc_box_recent",
          partialFilterExpression: { box_id: { $type: "string" } },
        }
      );
    await db
      .collection("outbound_scans")
      .createIndex(
        { type: 1, createdAt: -1 },
        { name: "osc_type_recent" }
      );
    await db
      .collection("outbound_scans")
      .createIndex(
        { operator_staff_id: 1, createdAt: -1 },
        { name: "osc_staff_recent" }
      );

    // ── outbound_requests: warehouse pipeline view supplement ─
    // Existing P7 indexes already cover client/status/carrier; add the
    // WMS-side view "show me all outbounds in this status bucket".
    await db
      .collection("outbound_requests")
      .createIndex(
        { warehouseCode: 1, status: 1, createdAt: 1 },
        { name: "ob_wh_status_oldest_first" }
      );
  },

  async down(db) {
    const drops = [
      ["outbound_boxes", "obx_outbound_status"],
      ["outbound_boxes", "obx_box_no_unique"],
      ["outbound_boxes", "obx_tracking_unique"],
      ["box_inbound_links", "bil_active_inbound_unique"],
      ["box_inbound_links", "bil_box_inbound"],
      ["box_inbound_links", "bil_outbound_recent"],
      ["outbound_box_weights", "obw_box_unique"],
      ["outbound_box_weights", "obw_outbound_recent"],
      ["outbound_scans", "osc_outbound_recent"],
      ["outbound_scans", "osc_inbound_recent"],
      ["outbound_scans", "osc_box_recent"],
      ["outbound_scans", "osc_type_recent"],
      ["outbound_scans", "osc_staff_recent"],
      ["outbound_requests", "ob_wh_status_oldest_first"],
    ];
    for (const [col, idx] of drops) {
      await db.collection(col).dropIndex(idx).catch(() => {});
    }
  },
};

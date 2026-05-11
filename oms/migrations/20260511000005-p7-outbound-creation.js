// Phase 7 — outbound creation + rate quote + label.
// Creates indexes for outbound_requests (v1 fields overlay legacy doc),
// outbound_inbound_links (N:N), outbound_action_logs (append-only audit),
// and rate_quote_logs (carrier API call log).

module.exports = {
  async up(db) {
    // ── outbound_requests ────────────────────────────────────
    // Client list filtered by status + sort by createdAt desc
    await db
      .collection("outbound_requests")
      .createIndex(
        { client_id: 1, status: 1, createdAt: -1 },
        { name: "ob_client_status_created" }
      );
    // Admin queue by status + preference (auto-processing pipeline)
    await db
      .collection("outbound_requests")
      .createIndex(
        { status: 1, processing_preference: 1, createdAt: 1 },
        { name: "ob_status_preference_created" }
      );
    // Carrier-bound queries (per-carrier ops monitoring)
    await db
      .collection("outbound_requests")
      .createIndex(
        { carrier_code: 1, status: 1 },
        { name: "ob_carrier_status" }
      );
    // Held outbounds queue (released on balance/auth restoration)
    await db
      .collection("outbound_requests")
      .createIndex(
        { held_reason: 1, status: 1, held_since: 1 },
        {
          name: "ob_held_reason_since",
          partialFilterExpression: { status: "held" },
        }
      );
    // Warehouse pipeline view
    await db
      .collection("outbound_requests")
      .createIndex(
        { warehouseCode: 1, status: 1 },
        { name: "ob_warehouse_status" }
      );

    // ── outbound_inbound_links ──────────────────────────────
    // Active link guard: prevent same inbound in two active outbounds
    await db
      .collection("outbound_inbound_links")
      .createIndex(
        { inbound_id: 1 },
        {
          name: "obl_active_inbound_unique",
          unique: true,
          partialFilterExpression: { unlinked_at: null },
        }
      );
    await db
      .collection("outbound_inbound_links")
      .createIndex(
        { outbound_id: 1, inbound_id: 1 },
        { name: "obl_outbound_inbound" }
      );
    await db
      .collection("outbound_inbound_links")
      .createIndex(
        { client_id: 1, linked_at: -1 },
        { name: "obl_client_recent" }
      );

    // ── outbound_action_logs ────────────────────────────────
    await db
      .collection("outbound_action_logs")
      .createIndex(
        { outbound_id: 1, createdAt: 1 },
        { name: "oal_outbound_time" }
      );
    await db
      .collection("outbound_action_logs")
      .createIndex(
        { client_id: 1, createdAt: -1 },
        { name: "oal_client_recent" }
      );
    await db
      .collection("outbound_action_logs")
      .createIndex(
        { action: 1, createdAt: -1 },
        { name: "oal_action_recent" }
      );

    // ── rate_quote_logs ─────────────────────────────────────
    await db
      .collection("rate_quote_logs")
      .createIndex(
        { outbound_id: 1, createdAt: 1 },
        {
          name: "rql_outbound_time",
          partialFilterExpression: { outbound_id: { $type: "string" } },
        }
      );
    await db
      .collection("rate_quote_logs")
      .createIndex(
        { client_id: 1, createdAt: -1 },
        { name: "rql_client_recent" }
      );
    await db
      .collection("rate_quote_logs")
      .createIndex(
        { carrier_code: 1, success: 1, createdAt: -1 },
        { name: "rql_carrier_success" }
      );
  },

  async down(db) {
    const drops = [
      ["outbound_requests", "ob_client_status_created"],
      ["outbound_requests", "ob_status_preference_created"],
      ["outbound_requests", "ob_carrier_status"],
      ["outbound_requests", "ob_held_reason_since"],
      ["outbound_requests", "ob_warehouse_status"],
      ["outbound_inbound_links", "obl_active_inbound_unique"],
      ["outbound_inbound_links", "obl_outbound_inbound"],
      ["outbound_inbound_links", "obl_client_recent"],
      ["outbound_action_logs", "oal_outbound_time"],
      ["outbound_action_logs", "oal_client_recent"],
      ["outbound_action_logs", "oal_action_recent"],
      ["rate_quote_logs", "rql_outbound_time"],
      ["rate_quote_logs", "rql_client_recent"],
      ["rate_quote_logs", "rql_carrier_success"],
    ];
    for (const [col, idx] of drops) {
      await db.collection(col).dropIndex(idx).catch(() => {});
    }
  },
};

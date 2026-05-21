// Phase 17 — schema additions for YT flow + unclaimed-pool warning stages
// + system-owned carrier accounts.
//
// Adds (all backwards-compatible defaults so existing rows keep working):
//
//   inbound_requests:
//     - is_yt (bool, default false)
//
//   outbound_requests:
//     - is_yt (bool, default false)        — YT auto-generated outbound flag
//     - auto_generated (bool, default false) — distinguishes cron-created
//       outbound from human-created
//
//   unclaimed_inbounds:
//     - warning_stages (array, default [])  — entries shaped as
//       { stage: "14d" | "25d" | "30d_abandoned", sent_at: Date }
//     - abandoned_at (Date | null, default null) — set when stage 30d fires
//
//   client_carrier_accounts:
//     - owner_type ("client" | "system", default "client") — system rows
//       are WMS-owned (e.g. shipitasia's own fuuffy account for YT)
//     - existing rows backfilled to owner_type: "client"
//     - client_id stays required for owner_type=client; system rows may
//       omit it (or set null).
//
// Indexes added to support fast lookup of today's YT outbound + system
// account resolution. All idempotent (re-running is a no-op).

module.exports = {
  async up(db) {
    // ── inbound_requests ────────────────────────────────────
    await db
      .collection("inbound_requests")
      .updateMany(
        { is_yt: { $exists: false } },
        { $set: { is_yt: false } }
      );
    await db
      .collection("inbound_requests")
      .createIndex(
        { is_yt: 1, status: 1 },
        {
          name: "inbound_yt_status",
          partialFilterExpression: { is_yt: true },
        }
      );

    // ── outbound_requests ───────────────────────────────────
    await db.collection("outbound_requests").updateMany(
      {
        $or: [
          { is_yt: { $exists: false } },
          { auto_generated: { $exists: false } },
        ],
      },
      { $set: { is_yt: false, auto_generated: false } }
    );
    // Lookup "today's YT outbound for this warehouse" — used by
    // appendYtToTodayOutbound() on shelf-receive.
    await db
      .collection("outbound_requests")
      .createIndex(
        { is_yt: 1, warehouseCode: 1, createdAt: -1 },
        {
          name: "outbound_yt_warehouse_recent",
          partialFilterExpression: { is_yt: true },
        }
      );

    // ── unclaimed_inbounds ──────────────────────────────────
    await db.collection("unclaimed_inbounds").updateMany(
      {
        $or: [
          { warning_stages: { $exists: false } },
          { abandoned_at: { $exists: false } },
        ],
      },
      { $set: { warning_stages: [], abandoned_at: null } }
    );
    // Cron scan: arrived_at older than threshold AND not yet abandoned.
    await db
      .collection("unclaimed_inbounds")
      .createIndex(
        { status: 1, arrived_at: 1 },
        { name: "unclaimed_status_arrived" }
      );

    // ── client_carrier_accounts ─────────────────────────────
    await db
      .collection("client_carrier_accounts")
      .updateMany(
        { owner_type: { $exists: false } },
        { $set: { owner_type: "client" } }
      );
    // Only one system row per carrier (singleton). Partial unique so we
    // don't conflict with the existing client-row nickname uniqueness.
    await db
      .collection("client_carrier_accounts")
      .createIndex(
        { owner_type: 1, carrier_code: 1 },
        {
          name: "carrier_system_singleton",
          unique: true,
          partialFilterExpression: { owner_type: "system" },
        }
      );
  },

  async down(db) {
    const dropIfExists = async (col, name) => {
      try {
        await db.collection(col).dropIndex(name);
      } catch {
        // swallow — index may not exist on rollback
      }
    };
    await dropIfExists("inbound_requests", "inbound_yt_status");
    await dropIfExists(
      "outbound_requests",
      "outbound_yt_warehouse_recent"
    );
    await dropIfExists("unclaimed_inbounds", "unclaimed_status_arrived");
    await dropIfExists("client_carrier_accounts", "carrier_system_singleton");

    await db
      .collection("inbound_requests")
      .updateMany({}, { $unset: { is_yt: "" } });
    await db
      .collection("outbound_requests")
      .updateMany({}, { $unset: { is_yt: "", auto_generated: "" } });
    await db
      .collection("unclaimed_inbounds")
      .updateMany({}, { $unset: { warning_stages: "", abandoned_at: "" } });
    await db
      .collection("client_carrier_accounts")
      .updateMany({}, { $unset: { owner_type: "" } });
  },
};

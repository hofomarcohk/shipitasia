// Phase 3 — wallet_transactions + topup_requests indexes.
// No seed (collections start empty; balance lives on clients doc as cache,
// already there since the P1 schema migration set default 0).

module.exports = {
  async up(db) {
    // wallet_transactions — append-only; indexes match query paths in spec §2.1
    await db
      .collection("wallet_transactions")
      .createIndex(
        { client_id: 1, createdAt: -1 },
        { name: "wallet_tx_by_client_recent" }
      );
    await db
      .collection("wallet_transactions")
      .createIndex(
        { type: 1, createdAt: -1 },
        { name: "wallet_tx_by_type_recent" }
      );
    await db
      .collection("wallet_transactions")
      .createIndex(
        { reference_type: 1, reference_id: 1 },
        {
          name: "wallet_tx_by_reference",
          partialFilterExpression: { reference_type: { $exists: true } },
        }
      );

    // topup_requests — pending queue + per-client view
    await db
      .collection("topup_requests")
      .createIndex(
        { status: 1, submitted_at: 1 },
        { name: "topup_pending_queue" }
      );
    await db
      .collection("topup_requests")
      .createIndex(
        { client_id: 1, status: 1, submitted_at: -1 },
        { name: "topup_by_client_recent" }
      );
  },

  async down(db) {
    const idx = [
      ["wallet_transactions", "wallet_tx_by_client_recent"],
      ["wallet_transactions", "wallet_tx_by_type_recent"],
      ["wallet_transactions", "wallet_tx_by_reference"],
      ["topup_requests", "topup_pending_queue"],
      ["topup_requests", "topup_by_client_recent"],
    ];
    for (const [coll, name] of idx) {
      await db.collection(coll).dropIndex(name).catch(() => {});
    }
  },
};

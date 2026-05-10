// Phase 1 — clients schema migration + audit_logs index
//
// Adds:
//   clients.email          unique
//   clients.oauth_providers (provider + provider_user_id) sparse compound unique
//   audit_logs (target_type, target_id, created_at desc)
//   audit_logs (actor_type, actor_id, created_at desc)
//   audit_logs (action, created_at desc)
//
// The clients collection may already exist from inherited code; createIndex is
// idempotent so re-running is safe. Down() drops just what we added — does not
// reverse data shape changes.

module.exports = {
  async up(db) {
    await db.collection("clients").createIndex(
      { email: 1 },
      { unique: true, name: "email_unique", sparse: true }
    );
    await db.collection("clients").createIndex(
      { "oauth_providers.provider": 1, "oauth_providers.provider_user_id": 1 },
      {
        unique: true,
        name: "oauth_provider_unique",
        partialFilterExpression: { "oauth_providers.0": { $exists: true } },
      }
    );

    await db.collection("audit_logs").createIndex(
      { target_type: 1, target_id: 1, created_at: -1 },
      { name: "audit_target_recent" }
    );
    await db.collection("audit_logs").createIndex(
      { actor_type: 1, actor_id: 1, created_at: -1 },
      { name: "audit_actor_recent" }
    );
    await db.collection("audit_logs").createIndex(
      { action: 1, created_at: -1 },
      { name: "audit_action_recent" }
    );
  },

  async down(db) {
    await db.collection("clients").dropIndex("email_unique").catch(() => {});
    await db
      .collection("clients")
      .dropIndex("oauth_provider_unique")
      .catch(() => {});
    await db
      .collection("audit_logs")
      .dropIndex("audit_target_recent")
      .catch(() => {});
    await db
      .collection("audit_logs")
      .dropIndex("audit_actor_recent")
      .catch(() => {});
    await db
      .collection("audit_logs")
      .dropIndex("audit_action_recent")
      .catch(() => {});
  },
};

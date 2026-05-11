// Bugfix wave 3 — client-managed saved address book. Lets clients reuse
// previously-shipped addresses (with a friendly label) in inbound /
// outbound new forms without re-typing.

module.exports = {
  async up(db) {
    await db
      .collection("saved_addresses")
      .createIndex(
        { client_id: 1, createdAt: -1 },
        { name: "sa_client_recent" }
      );
    await db
      .collection("saved_addresses")
      .createIndex(
        { client_id: 1, is_default: 1 },
        {
          name: "sa_client_default",
          partialFilterExpression: { is_default: true },
        }
      );
    // Soft uniqueness on (client_id, label) so the dropdown stays readable.
    await db
      .collection("saved_addresses")
      .createIndex(
        { client_id: 1, label: 1 },
        { name: "sa_client_label_unique", unique: true }
      );
  },
  async down(db) {
    await db
      .collection("saved_addresses")
      .dropIndex("sa_client_recent")
      .catch(() => {});
    await db
      .collection("saved_addresses")
      .dropIndex("sa_client_default")
      .catch(() => {});
    await db
      .collection("saved_addresses")
      .dropIndex("sa_client_label_unique")
      .catch(() => {});
  },
};

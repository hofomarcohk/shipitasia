// P10 — client-managed saved item library. Per-customer template store
// for declared items picked at inbound time. Also adds a sidebar entry
// under the OMS "account" group so customers can manage the library.

module.exports = {
  async up(db) {
    // Indexes: list-by-recent, list-by-used-count, search-by-name, dedupe.
    await db
      .collection("saved_items")
      .createIndex(
        { client_id: 1, last_used_at: -1 },
        { name: "si_client_recent" }
      );
    await db
      .collection("saved_items")
      .createIndex(
        { client_id: 1, used_count: -1 },
        { name: "si_client_used" }
      );
    await db
      .collection("saved_items")
      .createIndex(
        { client_id: 1, product_name: "text" },
        { name: "si_client_name_text" }
      );

    // Append "saved_items" entry into the existing OMS "account" group
    // (profile + addresses). Idempotent — re-run replaces the group doc.
    const account = await db
      .collection("menu_urls")
      .findOne({ name: "account", context: "oms" });
    const items = (account?.items ?? []).filter(
      (i) => i.name !== "saved_items"
    );
    items.push({
      name: "saved_items",
      icon: "IconBookmarks",
      url: "/zh-hk/saved-items",
    });
    await db.collection("menu_urls").updateOne(
      { name: "account", context: "oms" },
      {
        $set: {
          name: "account",
          context: "oms",
          order: 90,
          items,
        },
      },
      { upsert: true }
    );
  },

  async down(db) {
    await db
      .collection("saved_items")
      .dropIndex("si_client_recent")
      .catch(() => {});
    await db
      .collection("saved_items")
      .dropIndex("si_client_used")
      .catch(() => {});
    await db
      .collection("saved_items")
      .dropIndex("si_client_name_text")
      .catch(() => {});

    const account = await db
      .collection("menu_urls")
      .findOne({ name: "account", context: "oms" });
    if (account) {
      const items = (account.items ?? []).filter(
        (i) => i.name !== "saved_items"
      );
      await db
        .collection("menu_urls")
        .updateOne(
          { name: "account", context: "oms" },
          { $set: { items } }
        );
    }
  },
};

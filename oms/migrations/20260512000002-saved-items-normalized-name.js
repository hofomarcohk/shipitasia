// P10 item-dialog redesign — saved-items library now keyed by
// normalize(product_name) for upsert-by-name on inbound commit.
// Backfills existing rows + adds the lookup index.

function normalizeName(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

module.exports = {
  async up(db) {
    // Backfill normalized_name on existing docs.
    const cursor = db.collection("saved_items").find({
      $or: [
        { normalized_name: { $exists: false } },
        { normalized_name: null },
        { normalized_name: "" },
      ],
    });
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const n = normalizeName(doc.product_name ?? "");
      if (n) {
        await db
          .collection("saved_items")
          .updateOne({ _id: doc._id }, { $set: { normalized_name: n } });
      }
    }
    // Non-unique because pre-existing data may already contain dupes per
    // customer; the service-level upsert reconciles via findOne, and the
    // first migration cycle is allowed to land with the messy state.
    await db
      .collection("saved_items")
      .createIndex(
        { client_id: 1, normalized_name: 1 },
        { name: "si_client_norm_name" }
      );
  },

  async down(db) {
    await db
      .collection("saved_items")
      .dropIndex("si_client_norm_name")
      .catch(() => {});
    await db
      .collection("saved_items")
      .updateMany({}, { $unset: { normalized_name: "" } });
  },
};

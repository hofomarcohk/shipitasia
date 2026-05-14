// Phase 10 hotfix — original 20260512000004-p10-menu-entries.js looked up a
// non-existent parent ({ name: "operations", context: "wms" }), so the
// ops_pick_batch item was never inserted into the WMS sidebar. The real
// parent group in this DB is "wms_pack_group" (sibling of ops_pick / ops_pack
// / ops_weigh). Idempotent so re-running is safe.

const WMS_NEW_ITEM = {
  name: "ops_pick_batch",
  icon: "IconLayoutGrid",
  url: "/zh-hk/wms/operations/pick-batch",
};

module.exports = {
  async up(db) {
    const parent = await db
      .collection("menu_urls")
      .findOne({ name: "wms_pack_group", context: "wms" });
    if (!parent) return;
    const items = Array.isArray(parent.items) ? parent.items.slice() : [];
    if (items.find((i) => i.name === WMS_NEW_ITEM.name)) return;
    const i = items.findIndex((it) => it.name === "ops_pick");
    const pos = i >= 0 ? i + 1 : items.length;
    items.splice(pos, 0, WMS_NEW_ITEM);
    await db
      .collection("menu_urls")
      .updateOne({ _id: parent._id }, { $set: { items } });
  },
  async down(db) {
    await db.collection("menu_urls").updateOne(
      { name: "wms_pack_group", context: "wms" },
      { $pull: { items: { name: WMS_NEW_ITEM.name } } }
    );
  },
};

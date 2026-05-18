// P16 — WMS sidebar entry for the working-calendar admin page. Idempotent
// via name lookup so re-running doesn't duplicate.

const WMS_ITEM = {
  name: "ops_working_calendar",
  icon: "IconCalendarTime",
  url: "/zh-hk/wms/operations/working-calendar",
};

module.exports = {
  async up(db) {
    const wmsOps = await db
      .collection("menu_urls")
      .findOne({ name: "operations", context: "wms" });
    if (!wmsOps) return;
    const items = Array.isArray(wmsOps.items) ? wmsOps.items.slice() : [];
    if (items.find((i) => i.name === WMS_ITEM.name)) return;
    items.push(WMS_ITEM);
    await db
      .collection("menu_urls")
      .updateOne({ _id: wmsOps._id }, { $set: { items } });
  },

  async down(db) {
    await db.collection("menu_urls").updateOne(
      { name: "operations", context: "wms" },
      { $pull: { items: { name: WMS_ITEM.name } } }
    );
  },
};

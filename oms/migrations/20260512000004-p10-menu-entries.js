// Phase 10 — extend the wms/pda sidebar with the new pick batch + shelf
// scan entries. Uses $addToSet on items to stay idempotent (re-running
// won't duplicate).

const WMS_NEW_ITEM = {
  name: "ops_pick_batch",
  icon: "IconLayoutGrid",
  url: "/zh-hk/wms/operations/pick-batch",
};

const PDA_NEW_ITEM = {
  name: "scan_shelf",
  icon: "IconDeviceMobile",
  url: "/zh-hk/wms/pda/scan/shelf",
};

module.exports = {
  async up(db) {
    // WMS desktop sidebar — add the batch entry just after ops_pick.
    const wmsOps = await db
      .collection("menu_urls")
      .findOne({ name: "operations", context: "wms" });
    if (wmsOps) {
      const items = Array.isArray(wmsOps.items) ? wmsOps.items.slice() : [];
      if (!items.find((i) => i.name === WMS_NEW_ITEM.name)) {
        // insert after ops_pick if found, else at index 1
        const i = items.findIndex((it) => it.name === "ops_pick");
        const pos = i >= 0 ? i + 1 : 1;
        items.splice(pos, 0, WMS_NEW_ITEM);
        await db
          .collection("menu_urls")
          .updateOne({ _id: wmsOps._id }, { $set: { items } });
      }
    }

    // PDA sidebar — shelf-scan goes first (it's the most common action).
    const pdaScan = await db
      .collection("menu_urls")
      .findOne({ name: "scan", context: "pda" });
    if (pdaScan) {
      const items = Array.isArray(pdaScan.items) ? pdaScan.items.slice() : [];
      if (!items.find((i) => i.name === PDA_NEW_ITEM.name)) {
        items.unshift(PDA_NEW_ITEM);
        await db
          .collection("menu_urls")
          .updateOne({ _id: pdaScan._id }, { $set: { items } });
      }
    }
  },
  async down(db) {
    await db.collection("menu_urls").updateOne(
      { name: "operations", context: "wms" },
      { $pull: { items: { name: WMS_NEW_ITEM.name } } }
    );
    await db.collection("menu_urls").updateOne(
      { name: "scan", context: "pda" },
      { $pull: { items: { name: PDA_NEW_ITEM.name } } }
    );
  },
};

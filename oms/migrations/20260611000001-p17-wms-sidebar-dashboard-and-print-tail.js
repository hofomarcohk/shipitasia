// Phase 17 — WMS sidebar follow-up to migration p17-wms-sidebar-restructure.
//
// Two things 20260521000003 missed (brief: docs/wms-redesign-brief.md §3):
//
//   1. 工作台 (/zh-hk/wms) was deferred in 20260521000003 because the page
//      didn't exist yet. It now exists (commit c029cbd「工作台重新設計成倉庫
//      儀錶板」). Add it as a standalone home group ordered before
//      起始流程. i18n labels `wms_home_group` / `ops_home` are already in
//      messages/{zh-hk,zh-cn,en}.json.
//
//   2. 出貨作業 brief order is …→ 桌面離倉 → 重印面單 (label-print 排最尾，
//      失敗恢復頁). 20260521000003 had label-print before depart — swap.
//
// Note: commit e38d8b7「入出庫流程貫通 + YT 流程 + 取單/離站修正」's message
// claims this menu work was done («menu：…面單列印→重印面單下移、工作台置頂»),
// but the commit only includes i18n labels + flow.ts changes — the menu_urls
// schema/seed was applied directly to the dev DB and never persisted as a
// migration. This file finishes that job.
//
// Idempotent: re-running upserts wms_home_group and rewrites
// wms_outbound_group.items wholesale.

const HOME_GROUP = {
  name: "wms_home_group",
  context: "wms",
  order: 5,
  items: [
    { name: "ops_home", icon: "IconHome", url: "/zh-hk/wms" },
  ],
};

const OUTBOUND_ITEMS_FIXED = [
  { name: "ops_pick_batch",  icon: "IconLayoutGrid",  url: "/zh-hk/wms/operations/pick-batch" },
  { name: "ops_pack",        icon: "IconBox",         url: "/zh-hk/wms/operations/pack" },
  { name: "ops_weigh",       icon: "IconLayoutBoard", url: "/zh-hk/wms/operations/weigh" },
  { name: "ops_depart",      icon: "IconTruck",       url: "/zh-hk/wms/operations/depart" },
  { name: "ops_label_print", icon: "IconTag",         url: "/zh-hk/wms/operations/label-print" },
];

const OUTBOUND_ITEMS_PRE = [
  { name: "ops_pick_batch",  icon: "IconLayoutGrid",  url: "/zh-hk/wms/operations/pick-batch" },
  { name: "ops_pack",        icon: "IconBox",         url: "/zh-hk/wms/operations/pack" },
  { name: "ops_weigh",       icon: "IconLayoutBoard", url: "/zh-hk/wms/operations/weigh" },
  { name: "ops_label_print", icon: "IconTag",         url: "/zh-hk/wms/operations/label-print" },
  { name: "ops_depart",      icon: "IconTruck",       url: "/zh-hk/wms/operations/depart" },
];

module.exports = {
  async up(db) {
    const now = new Date();

    await db.collection("menu_urls").deleteMany({ context: "wms", name: "wms_home_group" });
    await db.collection("menu_urls").insertOne({
      ...HOME_GROUP,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection("menu_urls").updateOne(
      { context: "wms", name: "wms_outbound_group" },
      { $set: { items: OUTBOUND_ITEMS_FIXED, updatedAt: now } }
    );
  },

  async down(db) {
    const now = new Date();

    await db.collection("menu_urls").deleteMany({ context: "wms", name: "wms_home_group" });

    await db.collection("menu_urls").updateOne(
      { context: "wms", name: "wms_outbound_group" },
      { $set: { items: OUTBOUND_ITEMS_PRE, updatedAt: now } }
    );
  },
};

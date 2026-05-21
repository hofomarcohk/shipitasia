// Phase 17 — WMS sidebar 4-group restructure per design handoff
// (design_handoff_wms_redesign/README.md).
//
// Target structure for context="wms":
//
//   起始流程 (wms_origin_group)
//     - ops_arrive_monitor     (desktop monitor view of PDA scans)
//     - ops_receive            (上架管理)
//
//   出貨作業 (wms_outbound_group)
//     - ops_pick_batch         (揀貨任務)
//     - ops_pack               (裝箱任務)
//     - ops_weigh              (秤重取單)
//     - ops_label_print        (印單)
//     - ops_depart             (離站掃描)
//
//   管理 (wms_manage_group)
//     - ops_unclaimed          (無頭件池)
//     - admin_topup            (儲值審核)
//
// Deliberately NOT migrated (handoff omits; routes still reachable by URL
// for ops-only access):
//   - ops_pick (single pick; replaced by batch)
//   - ops_locations (貨架管理)
//   - ops_inbound_history
//   - ops_abandoned (consolidated into 無頭件池 30-day countdown)
//   - ops_working_calendar (teammate Marco: 不需要)
//
// Top-level (工作台 / 任務隊列 / 所有出庫單) and 管理 entries that need
// new pages (Courier 帳號, 設定) are deferred to the migration that
// ships those pages — adding them now would 404 the sidebar.
//
// Strategy: wipe context="wms" groups + reinsert. Drift-tolerant (the
// db may diverge from what older migrations declared, e.g. the
// "wms_pack_group" the P10 fix migration referenced). OMS / PDA
// contexts are left untouched.

const TARGET_GROUPS = [
  {
    name: "wms_origin_group",
    context: "wms",
    order: 10,
    items: [
      {
        name: "ops_arrive_monitor",
        icon: "IconScan",
        url: "/zh-hk/wms/operations/arrive",
      },
      {
        name: "ops_receive",
        icon: "IconPackage",
        url: "/zh-hk/wms/operations/receive",
      },
    ],
  },
  {
    name: "wms_outbound_group",
    context: "wms",
    order: 20,
    items: [
      {
        name: "ops_pick_batch",
        icon: "IconLayoutGrid",
        url: "/zh-hk/wms/operations/pick-batch",
      },
      {
        name: "ops_pack",
        icon: "IconBox",
        url: "/zh-hk/wms/operations/pack",
      },
      {
        name: "ops_weigh",
        icon: "IconLayoutBoard",
        url: "/zh-hk/wms/operations/weigh",
      },
      {
        name: "ops_label_print",
        icon: "IconTag",
        url: "/zh-hk/wms/operations/label-print",
      },
      {
        name: "ops_depart",
        icon: "IconTruck",
        url: "/zh-hk/wms/operations/depart",
      },
    ],
  },
  {
    name: "wms_manage_group",
    context: "wms",
    order: 30,
    items: [
      {
        name: "ops_unclaimed",
        icon: "IconHomeQuestion",
        url: "/zh-hk/wms/operations/unclaimed-inbounds",
      },
      {
        name: "admin_topup",
        icon: "IconReceipt2",
        url: "/zh-hk/wms/admin/topup-requests",
      },
    ],
  },
];

// Snapshot of pre-P17 layout for down(). Kept here so a rollback is
// self-contained and doesn't need to chase older migrations.
const PRE_P17_GROUPS = [
  {
    name: "operations",
    context: "wms",
    order: 10,
    items: [
      { name: "ops_pick", icon: "IconClipboardCheck", url: "/zh-hk/wms/operations/pick" },
      { name: "ops_pick_batch", icon: "IconLayoutGrid", url: "/zh-hk/wms/operations/pick-batch" },
      { name: "ops_pack", icon: "IconBox", url: "/zh-hk/wms/operations/pack" },
      { name: "ops_weigh", icon: "IconLayoutBoard", url: "/zh-hk/wms/operations/weigh" },
      { name: "ops_label_print", icon: "IconTag", url: "/zh-hk/wms/operations/label-print" },
      { name: "ops_unclaimed", icon: "IconHomeQuestion", url: "/zh-hk/wms/operations/unclaimed-inbounds" },
      { name: "ops_abandoned", icon: "IconHomeSearch", url: "/zh-hk/wms/operations/abandoned-inbounds" },
      { name: "ops_inbound_history", icon: "IconDeviceIpadHorizontalSearch", url: "/zh-hk/wms/operations/inbound-history" },
      { name: "ops_locations", icon: "IconMapPin", url: "/zh-hk/wms/operations/locations" },
      { name: "ops_receive", icon: "IconPackage", url: "/zh-hk/wms/operations/receive" },
      { name: "ops_working_calendar", icon: "IconCalendar", url: "/zh-hk/wms/operations/working-calendar" },
    ],
  },
  {
    name: "wms_admin",
    context: "wms",
    order: 20,
    items: [
      { name: "admin_topup", icon: "IconReceipt2", url: "/zh-hk/wms/admin/topup-requests" },
    ],
  },
];

module.exports = {
  async up(db) {
    const now = new Date();
    await db.collection("menu_urls").deleteMany({ context: "wms" });
    await db.collection("menu_urls").insertMany(
      TARGET_GROUPS.map((g) => ({ ...g, createdAt: now, updatedAt: now }))
    );
  },

  async down(db) {
    const now = new Date();
    await db.collection("menu_urls").deleteMany({ context: "wms" });
    await db.collection("menu_urls").insertMany(
      PRE_P17_GROUPS.map((g) => ({ ...g, createdAt: now, updatedAt: now }))
    );
  },
};

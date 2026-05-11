// Menu seed — populates menu_urls so the sidebar renders. Should have
// been part of P1 but was missed; landed here so localhost manual testing
// can navigate the app. Keys map to messages/{locale}.json "menu.*"
// entries; icons map to components/ui/icon-handler.tsx whitelist.

const MENU_GROUPS = [
  {
    name: "inbound",
    order: 10,
    items: [
      { name: "my_inbound", icon: "IconPackage", url: "/zh-hk/inbound/list" },
      { name: "new_inbound", icon: "IconPackages", url: "/zh-hk/inbound/new" },
      {
        name: "pending_confirm",
        icon: "IconHomeQuestion",
        url: "/zh-hk/inbound/pending-confirm",
      },
    ],
  },
  {
    name: "outbound",
    order: 20,
    items: [
      { name: "outbound_list", icon: "IconTruck", url: "/zh-hk/outbound/list" },
      {
        name: "new_outbound",
        icon: "IconTruckLoading",
        url: "/zh-hk/outbound/new",
      },
      {
        name: "shipped",
        icon: "IconTruckDelivery",
        url: "/zh-hk/outbound/shipped",
      },
    ],
  },
  {
    name: "wallet_group",
    order: 30,
    items: [
      { name: "wallet", icon: "IconReceipt2", url: "/zh-hk/wallet" },
    ],
  },
  {
    name: "carrier_group",
    order: 40,
    items: [
      {
        name: "carrier_accounts",
        icon: "IconWorld",
        url: "/zh-hk/carrier-accounts",
      },
    ],
  },
  {
    name: "operations",
    order: 50,
    items: [
      {
        name: "ops_pick",
        icon: "IconClipboardCheck",
        url: "/zh-hk/operations/pick",
      },
      { name: "ops_pack", icon: "IconBox", url: "/zh-hk/operations/pack" },
      {
        name: "ops_weigh",
        icon: "IconLayoutBoard",
        url: "/zh-hk/operations/weigh",
      },
      {
        name: "ops_label_print",
        icon: "IconTag",
        url: "/zh-hk/operations/label-print",
      },
      {
        name: "ops_unclaimed",
        icon: "IconHomeQuestion",
        url: "/zh-hk/operations/unclaimed-inbounds",
      },
      {
        name: "ops_abandoned",
        icon: "IconHomeSearch",
        url: "/zh-hk/operations/abandoned-inbounds",
      },
      {
        name: "ops_inbound_history",
        icon: "IconDeviceIpadHorizontalSearch",
        url: "/zh-hk/operations/inbound-history",
      },
    ],
  },
  {
    name: "scan",
    order: 60,
    items: [
      {
        name: "scan_arrive",
        icon: "IconDeviceMobile",
        url: "/zh-hk/scan/inbound-arrive",
      },
      {
        name: "scan_receive",
        icon: "IconDeviceMobile",
        url: "/zh-hk/scan/inbound-receive",
      },
      {
        name: "scan_depart",
        icon: "IconDeviceMobile",
        url: "/zh-hk/scan/depart",
      },
    ],
  },
  {
    name: "account",
    order: 70,
    items: [
      { name: "profile", icon: "IconUserCircle", url: "/zh-hk/profile" },
    ],
  },
];

module.exports = {
  async up(db) {
    // Idempotent: upsert each group by `name` so re-running doesn't dup.
    for (const g of MENU_GROUPS) {
      await db
        .collection("menu_urls")
        .updateOne({ name: g.name }, { $set: g }, { upsert: true });
    }
  },
  async down(db) {
    const names = MENU_GROUPS.map((g) => g.name);
    await db.collection("menu_urls").deleteMany({ name: { $in: names } });
  },
};

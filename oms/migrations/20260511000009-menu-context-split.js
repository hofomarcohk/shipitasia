// Splits menu_urls into three contexts: oms (client) / wms (warehouse +
// CS desktop) / pda (warehouse mobile). Also updates URLs of moved
// routes (operations + admin + scan) to live under /wms/* and
// /wms/pda/*. Idempotent — re-running overwrites by `name`.

const OMS_GROUPS = [
  {
    name: "inbound",
    context: "oms",
    order: 10,
    items: [
      // Marco's feedback: "create first" matches the intuitive flow —
      // most visits to this section are to start a new declaration.
      { name: "new_inbound", icon: "IconPackages", url: "/zh-hk/inbound/new" },
      { name: "my_inbound", icon: "IconPackage", url: "/zh-hk/inbound/list" },
      {
        name: "pending_confirm",
        icon: "IconHomeQuestion",
        url: "/zh-hk/inbound/pending-confirm",
      },
    ],
  },
  {
    name: "outbound",
    context: "oms",
    order: 20,
    items: [
      {
        name: "new_outbound",
        icon: "IconTruckLoading",
        url: "/zh-hk/outbound/new",
      },
      { name: "outbound_list", icon: "IconTruck", url: "/zh-hk/outbound/list" },
      {
        name: "shipped",
        icon: "IconTruckDelivery",
        url: "/zh-hk/outbound/shipped",
      },
    ],
  },
  {
    name: "wallet_group",
    context: "oms",
    order: 30,
    items: [{ name: "wallet", icon: "IconReceipt2", url: "/zh-hk/wallet" }],
  },
  {
    name: "carrier_group",
    context: "oms",
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
    name: "account",
    context: "oms",
    order: 90,
    items: [
      { name: "profile", icon: "IconUserCircle", url: "/zh-hk/profile" },
    ],
  },
];

const WMS_GROUPS = [
  {
    name: "operations",
    context: "wms",
    order: 10,
    items: [
      {
        name: "ops_pick",
        icon: "IconClipboardCheck",
        url: "/zh-hk/wms/operations/pick",
      },
      { name: "ops_pack", icon: "IconBox", url: "/zh-hk/wms/operations/pack" },
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
        name: "ops_unclaimed",
        icon: "IconHomeQuestion",
        url: "/zh-hk/wms/operations/unclaimed-inbounds",
      },
      {
        name: "ops_abandoned",
        icon: "IconHomeSearch",
        url: "/zh-hk/wms/operations/abandoned-inbounds",
      },
      {
        name: "ops_inbound_history",
        icon: "IconDeviceIpadHorizontalSearch",
        url: "/zh-hk/wms/operations/inbound-history",
      },
    ],
  },
  {
    name: "wms_admin",
    context: "wms",
    order: 20,
    items: [
      {
        name: "admin_topup",
        icon: "IconReceipt2",
        url: "/zh-hk/wms/admin/topup-requests",
      },
    ],
  },
];

const PDA_GROUPS = [
  {
    name: "scan",
    context: "pda",
    order: 10,
    items: [
      {
        name: "scan_arrive",
        icon: "IconDeviceMobile",
        url: "/zh-hk/wms/pda/scan/inbound-arrive",
      },
      {
        name: "scan_receive",
        icon: "IconDeviceMobile",
        url: "/zh-hk/wms/pda/scan/inbound-receive",
      },
      {
        name: "scan_depart",
        icon: "IconDeviceMobile",
        url: "/zh-hk/wms/pda/scan/depart",
      },
    ],
  },
];

const ALL_GROUPS = [...OMS_GROUPS, ...WMS_GROUPS, ...PDA_GROUPS];

module.exports = {
  async up(db) {
    // Wipe legacy seed first (the previous migration wrote groups without a
    // `context` field). Re-insert with context tags.
    const legacyNames = [
      "inbound",
      "outbound",
      "wallet_group",
      "carrier_group",
      "operations",
      "scan",
      "account",
    ];
    await db
      .collection("menu_urls")
      .deleteMany({ name: { $in: legacyNames } });
    for (const g of ALL_GROUPS) {
      await db
        .collection("menu_urls")
        .updateOne(
          { name: g.name, context: g.context },
          { $set: g },
          { upsert: true }
        );
    }
  },
  async down(db) {
    const names = ALL_GROUPS.map((g) => g.name);
    await db.collection("menu_urls").deleteMany({ name: { $in: names } });
  },
};

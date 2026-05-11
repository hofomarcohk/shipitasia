// Phase 4 — inbound declaration master data + indexes.
//
// Adds:
//  - warehouses seed: JP-SAITAMA-01 (placeholder address — admin updates
//    via WMS later)
//  - carriers_inbound seed: 6 JP carriers (Sagawa, Japan Post, Yamato,
//    Seino, Fukuyama, Other)
//  - product_categories seed: 10 L1 + 40 L2, generated from
//    /MD/catgorylist.xlsx by _p4-categories-seed.js
//  - Indexes for inbound_requests / inbound_declared_items / notifications
//    / daily_counters / carriers_inbound / product_categories / warehouses
//
// Indexes follow phase4_oms_inbound_declaration.md §2.4 and §2.5.

const categoriesSeed = require("../scripts/seeds/categories.js");

const NOW = new Date();

const WAREHOUSE_SEED = [
  {
    warehouseCode: "JP-SAITAMA-01",
    name_zh: "日本埼玉倉",
    name_en: "Saitama Warehouse, Japan",
    country_code: "JP",
    declared_currency: "JPY",
    // Placeholder address — Marco will plug real address in via WMS later.
    // Kept non-empty so listing endpoints don't trip "incomplete" fallback.
    address_zh: "日本埼玉縣（地址待補）",
    address_en: "Saitama, Japan (address TBC)",
    postal_code: "000-0000",
    contact_phone: "+81-00-0000-0000",
    scan_config: null,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const CARRIER_INBOUND_SEED = [
  {
    carrier_inbound_code: "sagawa",
    name_zh: "佐川急便",
    name_en: "Sagawa Express",
    name_ja: "佐川急便",
    country_code: "JP",
    tracking_format_hint: "12 位數字",
    tracking_url_template:
      "https://k2k.sagawa-exp.co.jp/p/web/okurijoinput.do?okurijoNo={tracking_no}",
    status: "active",
    sort_order: 10,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    carrier_inbound_code: "japan_post",
    name_zh: "日本郵便 / ゆうパック",
    name_en: "Japan Post",
    name_ja: "日本郵便",
    country_code: "JP",
    tracking_format_hint: "13 字英數",
    tracking_url_template:
      "https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1={tracking_no}",
    status: "active",
    sort_order: 20,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    carrier_inbound_code: "yamato",
    name_zh: "ヤマト運輸",
    name_en: "Yamato Transport",
    name_ja: "ヤマト運輸",
    country_code: "JP",
    tracking_format_hint: "12 位數字",
    tracking_url_template:
      "https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?init=yes&number00=1&number01={tracking_no}",
    status: "active",
    sort_order: 30,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    carrier_inbound_code: "seino",
    name_zh: "西濃運輸",
    name_en: "Seino Transportation",
    name_ja: "西濃運輸",
    country_code: "JP",
    tracking_format_hint: null,
    tracking_url_template: null,
    status: "active",
    sort_order: 40,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    carrier_inbound_code: "fukuyama",
    name_zh: "福山通運",
    name_en: "Fukuyama Transporting",
    name_ja: "福山通運",
    country_code: "JP",
    tracking_format_hint: null,
    tracking_url_template: null,
    status: "active",
    sort_order: 50,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    carrier_inbound_code: "other",
    name_zh: "其他",
    name_en: "Other",
    name_ja: "その他",
    country_code: "JP",
    tracking_format_hint: "請於備註填寫實際快遞商",
    tracking_url_template: null,
    status: "active",
    sort_order: 999,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

module.exports = {
  async up(db) {
    // warehouses — already had a doc from inherited code? Upsert by code.
    for (const w of WAREHOUSE_SEED) {
      await db
        .collection("warehouses")
        .updateOne(
          { warehouseCode: w.warehouseCode },
          { $setOnInsert: w },
          { upsert: true }
        );
    }

    // carriers_inbound
    await db
      .collection("carriers_inbound")
      .createIndex(
        { carrier_inbound_code: 1 },
        { unique: true, name: "carrier_inbound_code_unique" }
      );
    for (const c of CARRIER_INBOUND_SEED) {
      await db
        .collection("carriers_inbound")
        .updateOne(
          { carrier_inbound_code: c.carrier_inbound_code },
          { $setOnInsert: c },
          { upsert: true }
        );
    }

    // product_categories
    await db
      .collection("product_categories")
      .createIndex({ parent_id: 1, sort_order: 1 }, { name: "category_tree" });
    for (const c of categoriesSeed) {
      await db
        .collection("product_categories")
        .updateOne({ _id: c._id }, { $setOnInsert: c }, { upsert: true });
    }

    // inbound_requests indexes
    // tracking_no_normalized unique per client + carrier. Mongo's
    // partialFilterExpression doesn't accept $ne, so cancelled-row
    // deduplication is handled at the service layer (we skip uniqueness
    // re-check on cancelled docs by zeroing tracking_no_normalized when
    // cancel runs — see inboundService.cancel).
    await db
      .collection("inbound_requests")
      .createIndex(
        {
          client_id: 1,
          carrier_inbound_code: 1,
          tracking_no_normalized: 1,
        },
        {
          unique: true,
          name: "tracking_no_dedupe",
          partialFilterExpression: {
            tracking_no_normalized: { $exists: true },
          },
        }
      );
    await db
      .collection("inbound_requests")
      .createIndex(
        { client_id: 1, status: 1, createdAt: -1 },
        { name: "inbound_by_client_status_recent" }
      );
    await db
      .collection("inbound_requests")
      .createIndex(
        { status: 1, createdAt: -1 },
        { name: "inbound_admin_listing" }
      );
    await db
      .collection("inbound_requests")
      .createIndex(
        { tracking_no_normalized: 1 },
        {
          name: "tracking_no_lookup",
          partialFilterExpression: {
            tracking_no_normalized: { $exists: true },
          },
        }
      );

    // inbound_declared_items
    await db
      .collection("inbound_declared_items")
      .createIndex(
        { inbound_request_id: 1, display_order: 1 },
        { name: "items_by_inbound" }
      );
    await db
      .collection("inbound_declared_items")
      .createIndex(
        { client_id: 1, category_id: 1 },
        { name: "items_by_client_category" }
      );

    // notifications
    await db
      .collection("notifications")
      .createIndex(
        { client_id: 1, is_read: 1, createdAt: -1 },
        { name: "notif_by_client_unread" }
      );
    await db
      .collection("notifications")
      .createIndex(
        { client_id: 1, type: 1 },
        { name: "notif_by_type" }
      );

    // daily_counters — explicit _id index is automatic; no extra needed
  },

  async down(db) {
    const idx = [
      ["carriers_inbound", "carrier_inbound_code_unique"],
      ["product_categories", "category_tree"],
      ["inbound_requests", "tracking_no_dedupe"],
      ["inbound_requests", "inbound_by_client_status_recent"],
      ["inbound_requests", "inbound_admin_listing"],
      ["inbound_requests", "tracking_no_lookup"],
      ["inbound_declared_items", "items_by_inbound"],
      ["inbound_declared_items", "items_by_client_category"],
      ["notifications", "notif_by_client_unread"],
      ["notifications", "notif_by_type"],
    ];
    for (const [coll, name] of idx) {
      await db.collection(coll).dropIndex(name).catch(() => {});
    }
    await db
      .collection("carriers_inbound")
      .deleteMany({
        carrier_inbound_code: { $in: CARRIER_INBOUND_SEED.map((c) => c.carrier_inbound_code) },
      });
    await db
      .collection("product_categories")
      .deleteMany({ _id: { $in: categoriesSeed.map((c) => c._id) } });
  },
};

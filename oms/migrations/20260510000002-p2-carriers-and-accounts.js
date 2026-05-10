// Phase 2 — carriers master + client_carrier_accounts schema/index/seed.
//
// Schemas live in services code (zod). This migration only:
//   - creates indexes
//   - seeds the v1 master data (yunexpress + fuuffy)
//
// down() drops the indexes and removes the seeds we wrote (matched by
// carrier_code so admin-created carriers stay).

const NOW = new Date();

const SEED_CARRIERS = [
  {
    carrier_code: "yunexpress",
    name_zh: "雲途物流",
    name_en: "YunExpress",
    auth_type: "api_key",
    credential_fields: [
      {
        key: "customer_code",
        label_zh: "客戶編號",
        label_en: "Customer Code",
        type: "text",
        required: true,
        placeholder: "例：ITC0893791",
        validation: { pattern: "^[A-Z0-9]+$", min_length: 5, max_length: 50 },
        is_secret: false,
      },
      {
        key: "api_secret",
        label_zh: "API Secret",
        label_en: "API Secret",
        type: "password",
        required: true,
        placeholder: "向雲途業務部申請取得",
        validation: { min_length: 10, max_length: 200 },
        is_secret: true,
      },
      {
        key: "use_sandbox",
        label_zh: "使用測試環境",
        label_en: "Use Sandbox",
        type: "checkbox",
        required: false,
        is_secret: false,
      },
    ],
    oauth_config: null,
    base_url: "http://oms.api.yunexpress.com",
    sandbox_url: "http://omsapi.uat.yunexpress.com",
    logo_url: null,
    status: "active",
    sort_order: 10,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    carrier_code: "fuuffy",
    name_zh: "Fuuffy",
    name_en: "Fuuffy",
    auth_type: "oauth",
    credential_fields: [],
    oauth_config: {
      client_id_env: "FUUFFY_OAUTH_CLIENT_ID",
      client_secret_env: "FUUFFY_OAUTH_CLIENT_SECRET",
      // v1 mock-only: these URLs are placeholders. Real Fuuffy endpoints
      // are populated at prod cutover (admin updates the carrier doc).
      authorize_url: "https://api-docs.fuuffy.com/oauth/authorize",
      token_url: "https://api-docs.fuuffy.com/oauth/token",
      scope: ["shipment:read", "shipment:write", "tracking:read"],
      redirect_path: "/api/cms/carrier/oauth/callback",
      extra_params: {},
    },
    base_url: "https://api.fuuffy.com",
    sandbox_url: "https://sandbox.api.fuuffy.com",
    logo_url: null,
    status: "active",
    sort_order: 20,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

module.exports = {
  async up(db) {
    // carriers indexes
    await db
      .collection("carriers")
      .createIndex(
        { carrier_code: 1 },
        { unique: true, name: "carrier_code_unique" }
      );
    await db
      .collection("carriers")
      .createIndex({ status: 1, sort_order: 1 }, { name: "carrier_listing" });

    // client_carrier_accounts indexes
    await db
      .collection("client_carrier_accounts")
      .createIndex(
        { client_id: 1, carrier_code: 1, nickname: 1 },
        {
          unique: true,
          name: "client_carrier_nickname_unique",
          partialFilterExpression: { deleted_at: null },
        }
      );
    await db
      .collection("client_carrier_accounts")
      .createIndex(
        { client_id: 1, status: 1, deleted_at: 1 },
        { name: "client_carrier_listing" }
      );
    await db
      .collection("client_carrier_accounts")
      .createIndex(
        { client_id: 1, is_default: 1 },
        {
          name: "client_carrier_default",
          partialFilterExpression: { is_default: true, deleted_at: null },
        }
      );

    // sync_failed_logs index — only target_id + created_at; admin UI scans
    // recent failures
    await db
      .collection("sync_failed_logs")
      .createIndex(
        { created_at: -1 },
        { name: "sync_failed_recent" }
      );

    // Seed master data — upsert by carrier_code so re-running is idempotent
    // even if the admin tweaked a row in between.
    for (const c of SEED_CARRIERS) {
      await db
        .collection("carriers")
        .updateOne(
          { carrier_code: c.carrier_code },
          { $setOnInsert: c },
          { upsert: true }
        );
    }
  },

  async down(db) {
    const indexDrops = [
      ["carriers", "carrier_code_unique"],
      ["carriers", "carrier_listing"],
      ["client_carrier_accounts", "client_carrier_nickname_unique"],
      ["client_carrier_accounts", "client_carrier_listing"],
      ["client_carrier_accounts", "client_carrier_default"],
      ["sync_failed_logs", "sync_failed_recent"],
    ];
    for (const [coll, idx] of indexDrops) {
      await db.collection(coll).dropIndex(idx).catch(() => {});
    }
    await db
      .collection("carriers")
      .deleteMany({ carrier_code: { $in: SEED_CARRIERS.map((c) => c.carrier_code) } });
  },
};

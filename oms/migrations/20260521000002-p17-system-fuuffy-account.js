// Phase 17 — seed the WMS-owned (system) Fuuffy carrier account used by
// YT auto-outbounds. One singleton row per carrier; enforced by the
// partial unique index added in 20260521000001-p17-yt-unclaimed-schema.
//
// credentials_enc is a mock placeholder for the mock-adapter phase. When
// the real Fuuffy API is wired (post-product cutover) the admin OAuth
// flow will replace this value via the existing
// client-carrier-accounts service.
//
// Up: upsert by (owner_type, carrier_code) so re-running is idempotent.
// Down: delete the system row but leave any client rows for fuuffy alone.

const SYSTEM_FUUFFY = {
  owner_type: "system",
  client_id: null,
  carrier_code: "fuuffy",
  nickname: "ShipItAsia System (YT)",
  auth_type: "oauth",
  // Mock-phase placeholder. Schema requires min(1); shape doesn't matter
  // because the mock adapter never decrypts it. Replace via admin OAuth
  // flow before pointing at real Fuuffy endpoints.
  credentials_enc: "MOCK:system-fuuffy-placeholder",
  oauth_meta: null,
  is_default: false,
  status: "active",
  last_used_at: null,
  deleted_at: null,
};

module.exports = {
  async up(db) {
    const now = new Date();
    await db.collection("client_carrier_accounts").updateOne(
      { owner_type: "system", carrier_code: SYSTEM_FUUFFY.carrier_code },
      {
        $setOnInsert: {
          ...SYSTEM_FUUFFY,
          createdAt: now,
        },
        $set: { updatedAt: now },
      },
      { upsert: true }
    );
  },

  async down(db) {
    await db
      .collection("client_carrier_accounts")
      .deleteOne({
        owner_type: "system",
        carrier_code: SYSTEM_FUUFFY.carrier_code,
      });
  },
};

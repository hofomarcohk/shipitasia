// P13 — managed consignment schema. Three OMS shipping modes
// (managed_consign / single_direct / manual_consolidate) replace the binary
// shipment_type. Adds consolidation_groups (one per managed-consign sweep
// candidate) and working_calendars (per-warehouse holiday table for the
// cron's 3-working-day SLA).
//
// Data backfill mapping:
//   shipment_type="consolidated" → shipping_mode="manual_consolidate"
//   shipment_type="single"       → shipping_mode="single_direct"
//   single_shipping              → shipping_destination (carrier_account_id +
//                                  receiver_address_snapshot; saved_address_id
//                                  stays null for legacy single rows)
//
// Existing rows are never auto-classified as managed_consign — that mode is
// opt-in on new forecasts only.

module.exports = {
  async up(db) {
    // ── 1. inbound_requests: rename enum + relocate single_shipping ──────

    const inbound = db.collection("inbound_requests");

    // 1a. consolidated → manual_consolidate
    await inbound.updateMany(
      { shipment_type: "consolidated" },
      {
        $set: {
          shipping_mode: "manual_consolidate",
          shipping_destination: null,
          consolidation_group_id: null,
        },
        $unset: { shipment_type: "" },
      }
    );

    // 1b. single → single_direct + move single_shipping payload
    const singles = await inbound
      .find({ shipment_type: "single" })
      .toArray();
    for (const doc of singles) {
      const ss = doc.single_shipping || {};
      await inbound.updateOne(
        { _id: doc._id },
        {
          $set: {
            shipping_mode: "single_direct",
            shipping_destination: {
              saved_address_id: null,
              receiver_address_snapshot: ss.receiver_address || null,
              carrier_account_id: ss.carrier_account_id || null,
            },
            consolidation_group_id: null,
          },
          $unset: { shipment_type: "", single_shipping: "" },
        }
      );
    }

    // ── 2. consolidation_groups ──────────────────────────────────────────

    const groups = db.collection("consolidation_groups");
    await groups.createIndex(
      {
        client_id: 1,
        saved_address_id: 1,
        carrier_account_id: 1,
        warehouseCode: 1,
        status: 1,
      },
      {
        name: "cg_lookup_pending",
        partialFilterExpression: { status: "pending" },
      }
    );
    await groups.createIndex(
      { status: 1, oldest_received_at: 1 },
      { name: "cg_sweep_scan" }
    );
    await groups.createIndex(
      { forecast_ids: 1 },
      {
        name: "cg_forecast_lookup",
        partialFilterExpression: { forecast_ids: { $exists: true } },
      }
    );

    // ── 3. working_calendars ─────────────────────────────────────────────

    const cal = db.collection("working_calendars");
    await cal.createIndex(
      { warehouseCode: 1, date: 1 },
      { name: "wc_wh_date_unique", unique: true }
    );
  },

  async down(db) {
    const inbound = db.collection("inbound_requests");

    // Reverse 1b first so single_direct → single + reattach single_shipping
    const singleDirects = await inbound
      .find({ shipping_mode: "single_direct" })
      .toArray();
    for (const doc of singleDirects) {
      const sd = doc.shipping_destination || {};
      await inbound.updateOne(
        { _id: doc._id },
        {
          $set: {
            shipment_type: "single",
            single_shipping: {
              receiver_address: sd.receiver_address_snapshot || null,
              carrier_account_id: sd.carrier_account_id || null,
            },
          },
          $unset: {
            shipping_mode: "",
            shipping_destination: "",
            consolidation_group_id: "",
          },
        }
      );
    }

    // Reverse 1a — both manual_consolidate and managed_consign roll back to
    // "consolidated" (no other v0 enum value fits, and managed_consign was
    // never assigned by this migration anyway).
    await inbound.updateMany(
      { shipping_mode: { $in: ["manual_consolidate", "managed_consign"] } },
      {
        $set: { shipment_type: "consolidated" },
        $unset: {
          shipping_mode: "",
          shipping_destination: "",
          consolidation_group_id: "",
        },
      }
    );

    await db
      .collection("consolidation_groups")
      .dropIndex("cg_lookup_pending")
      .catch(() => {});
    await db
      .collection("consolidation_groups")
      .dropIndex("cg_sweep_scan")
      .catch(() => {});
    await db
      .collection("consolidation_groups")
      .dropIndex("cg_forecast_lookup")
      .catch(() => {});
    await db
      .collection("working_calendars")
      .dropIndex("wc_wh_date_unique")
      .catch(() => {});
  },
};

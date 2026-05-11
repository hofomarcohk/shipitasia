// Phase 5 — WMS scan: locations seed + scan/item_locations indexes.

const NOW = new Date();

const WAREHOUSE_CODE = "JP-SAITAMA-01";

// Seed A001-A100 storage locations. Admin can disable / add via mongo
// until P5 master-data UI lands.
function locationSeed() {
  const out = [];
  for (let i = 1; i <= 100; i++) {
    const code = "A" + String(i).padStart(3, "0");
    out.push({
      warehouseCode: WAREHOUSE_CODE,
      locationCode: code,
      zone: "storage",
      status: "active",
      display_order: i,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  return out;
}

module.exports = {
  async up(db) {
    // locations
    await db
      .collection("locations")
      .createIndex(
        { warehouseCode: 1, locationCode: 1 },
        { unique: true, name: "location_code_unique" }
      );
    await db
      .collection("locations")
      .createIndex(
        { warehouseCode: 1, status: 1, display_order: 1 },
        { name: "location_listing" }
      );
    for (const l of locationSeed()) {
      await db
        .collection("locations")
        .updateOne(
          { warehouseCode: l.warehouseCode, locationCode: l.locationCode },
          { $setOnInsert: l },
          { upsert: true }
        );
    }

    // item_locations (Bug 6 rebuild) — itemCode unique so one inbound is in
    // at most one place at a time
    await db
      .collection("item_locations")
      .createIndex({ itemCode: 1 }, { unique: true, name: "item_code_unique" });
    await db
      .collection("item_locations")
      .createIndex(
        { warehouseCode: 1, locationCode: 1, currentStatus: 1 },
        { name: "items_by_location" }
      );

    // inbound_scans
    await db
      .collection("inbound_scans")
      .createIndex(
        { inbound_request_id: 1, createdAt: -1 },
        { name: "scans_by_inbound_recent" }
      );
    await db
      .collection("inbound_scans")
      .createIndex(
        { operator_staff_id: 1, createdAt: -1 },
        { name: "scans_by_operator_recent" }
      );
    await db
      .collection("inbound_scans")
      .createIndex(
        { type: 1, createdAt: -1 },
        { name: "scans_by_type_recent" }
      );
    await db
      .collection("inbound_scans")
      .createIndex(
        { unclaimed_inbound_id: 1 },
        {
          name: "scans_by_unclaimed",
          partialFilterExpression: { unclaimed_inbound_id: { $exists: true } },
        }
      );

    // unclaimed_inbounds
    await db
      .collection("unclaimed_inbounds")
      .createIndex(
        { status: 1, createdAt: -1 },
        { name: "unclaimed_by_status_recent" }
      );
    await db
      .collection("unclaimed_inbounds")
      .createIndex(
        { tracking_no_normalized: 1 },
        { name: "unclaimed_by_tracking" }
      );

    // staff_handled_abandoned — idempotent by inbound_request_id
    await db
      .collection("staff_handled_abandoned")
      .createIndex(
        { inbound_request_id: 1 },
        { unique: true, name: "abandoned_handled_unique" }
      );
  },

  async down(db) {
    const idx = [
      ["locations", "location_code_unique"],
      ["locations", "location_listing"],
      ["item_locations", "item_code_unique"],
      ["item_locations", "items_by_location"],
      ["inbound_scans", "scans_by_inbound_recent"],
      ["inbound_scans", "scans_by_operator_recent"],
      ["inbound_scans", "scans_by_type_recent"],
      ["inbound_scans", "scans_by_unclaimed"],
      ["unclaimed_inbounds", "unclaimed_by_status_recent"],
      ["unclaimed_inbounds", "unclaimed_by_tracking"],
      ["staff_handled_abandoned", "abandoned_handled_unique"],
    ];
    for (const [coll, name] of idx) {
      await db.collection(coll).dropIndex(name).catch(() => {});
    }
    await db
      .collection("locations")
      .deleteMany({ warehouseCode: WAREHOUSE_CODE });
  },
};

// Phase 9 smoke test — shipped listing + detail + UPS tracking URL build.
//
// Pre-req: P8 smoke client already exists with a departed outbound.
// We re-use that data; if not present, this script seeds a minimal departed
// outbound directly via mongo for stand-alone runs.
//
// Run: cd oms && npx tsx scripts/smoke-p9.mjs

import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcrypt";

process.on("unhandledRejection", (r) => {
  console.error("UNHANDLED REJECTION:", r);
  process.exit(2);
});

const URI =
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true";
const DB_NAME = process.env.MONGODB_NAME || "vw_sms";

const SEED_EMAIL = "p9smoke@example.com";
const SEED_PWD = "P9Smoke!2026";

async function main() {
  console.log("== smoke-p9 boot ==");
  const mc = new MongoClient(URI);
  await mc.connect();
  const db = mc.db(DB_NAME);

  // ── 0) Clean previous run ────────────────────────────────
  const prev = await db.collection("clients").findOne({ email: SEED_EMAIL });
  if (prev) {
    const cid = String(prev._id);
    await db.collection("outbound_requests").deleteMany({ client_id: cid });
    await db.collection("outbound_inbound_links").deleteMany({ client_id: cid });
    await db.collection("outbound_boxes").deleteMany({
      outbound_id: { $regex: "^OUT-20260511-9999" },
    });
    await db.collection("box_inbound_links").deleteMany({
      outbound_id: { $regex: "^OUT-20260511-9999" },
    });
    await db.collection("inbound_requests").deleteMany({ client_id: cid });
    await db.collection("inbound_declared_items").deleteMany({
      inbound_id: { $in: ["I-20260511-99991", "I-20260511-99992"] },
    });
    await db.collection("clients").deleteOne({ _id: prev._id });
  }

  // ── 1) Seed a "shipped" outbound directly ─────────────────
  const now = new Date();
  const cIns = await db.collection("clients").insertOne({
    email: SEED_EMAIL,
    password_hash: await bcrypt.hash(SEED_PWD, 10),
    company_name: "P9 Smoke",
    contact_name: "Test",
    country: "HK",
    phone: "+852-7777",
    email_verified: true,
    status: "active",
    onboarding_completed: true,
    balance: 0,
    createdAt: now,
    updatedAt: now,
  });
  const client_id = String(cIns.insertedId);

  const ob_id = "OUT-20260511-99991";
  const warehouse = await db
    .collection("warehouses")
    .findOne({ status: "active" });
  await db.collection("outbound_requests").insertOne({
    _id: ob_id,
    client_id,
    warehouseCode: warehouse.warehouseCode,
    shipment_type: "consolidated",
    inbound_count: 2,
    carrier_code: "fuuffy",
    carrier_account_id: null,
    service_code: "UPS Express Saver",
    destination_country: "HK",
    receiver_address: {
      name: "Jason Yeung",
      phone: "+852-64352652",
      country_code: "HK",
      city: "新界葵涌",
      address: "Rm06, 21C 21F",
      postal_code: null,
    },
    processing_preference: "confirm_before_label",
    status: "departed",
    held_reason: null,
    declared_weight_kg: 5,
    actual_weight_kg: 5.3,
    rate_quote: null,
    quoted_amount_hkd: 624,
    actual_label_fee: 624,
    label_obtained_at: now,
    label_url: "/uploads/labels/20260511/OUT-fake.pdf",
    tracking_no: "1ZB87K338634800548",
    departed_at: now,
    cancelled_at: null,
    customer_remarks: null,
    createdAt: now,
    updatedAt: now,
  });

  // 2 inbounds + their declared items
  const inb1 = "I-20260511-99991";
  const inb2 = "I-20260511-99992";
  await db.collection("inbound_requests").insertMany([
    {
      _id: inb1,
      client_id,
      warehouseCode: warehouse.warehouseCode,
      tracking_no: "ABC123XYZ",
      tracking_no_normalized: "ABC123XYZ",
      status: "departed",
      shipment_type: "consolidated",
      inbound_source: "regular",
      size_estimate: "small",
      contains_liquid: false,
      contains_battery: false,
      declared_value_total: 17000,
      declared_currency: "JPY",
      declared_items_count: 2,
      actualWeight: 2.5,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: inb2,
      client_id,
      warehouseCode: warehouse.warehouseCode,
      tracking_no: "DEF456UVW",
      tracking_no_normalized: "DEF456UVW",
      status: "departed",
      shipment_type: "consolidated",
      inbound_source: "regular",
      size_estimate: "small",
      contains_liquid: false,
      contains_battery: false,
      declared_value_total: 3000,
      declared_currency: "JPY",
      declared_items_count: 1,
      actualWeight: 2.8,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.collection("inbound_declared_items").insertMany([
    {
      inbound_id: inb1,
      category_id: "cat1",
      subcategory_id: "sub1",
      product_name: "PAPER GAME CARD",
      quantity: 1,
      unit_price: 5000,
      currency: "JPY",
      subtotal: 5000,
      display_order: 0,
    },
    {
      inbound_id: inb1,
      category_id: "cat2",
      subcategory_id: "sub2",
      product_name: "GAME DEVICE",
      quantity: 1,
      unit_price: 12000,
      currency: "JPY",
      subtotal: 12000,
      display_order: 1,
    },
    {
      inbound_id: inb2,
      category_id: "cat3",
      subcategory_id: "sub3",
      product_name: "電子產品配件",
      quantity: 2,
      unit_price: 1500,
      currency: "JPY",
      subtotal: 3000,
      display_order: 0,
    },
  ]);
  await db.collection("outbound_inbound_links").insertMany([
    {
      outbound_id: ob_id,
      inbound_id: inb1,
      client_id,
      linked_at: now,
      unlinked_at: null,
      unlink_reason: null,
    },
    {
      outbound_id: ob_id,
      inbound_id: inb2,
      client_id,
      linked_at: now,
      unlinked_at: null,
      unlink_reason: null,
    },
  ]);
  // 2 boxes
  const box1 = new ObjectId().toString();
  const box2 = new ObjectId().toString();
  await db.collection("outbound_boxes").insertMany([
    {
      _id: box1,
      outbound_id: ob_id,
      box_no: "B-99991-01",
      dimensions: { length: 46, width: 35, height: 40 },
      weight_estimate: 5,
      weight_actual: 5.3,
      tare_weight: 0.5,
      weight_diff: 0.1,
      weight_diff_passed: true,
      status: "departed",
      label_pdf_path: "/uploads/labels/20260511/box1.pdf",
      tracking_no_carrier: "1ZB87K338634800548",
      actual_label_fee: 312,
      label_obtained_at: now,
      label_obtained_by_operator_type: "client",
      departed_at: now,
      created_by_staff_id: "smoke",
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: box2,
      outbound_id: ob_id,
      box_no: "B-99991-02",
      dimensions: { length: 30, width: 25, height: 20 },
      weight_estimate: 3,
      weight_actual: 2.8,
      tare_weight: 0.4,
      weight_diff: -0.2,
      weight_diff_passed: true,
      status: "departed",
      label_pdf_path: "/uploads/labels/20260511/box2.pdf",
      tracking_no_carrier: "1ZB87K338600636718",
      actual_label_fee: 312,
      label_obtained_at: now,
      label_obtained_by_operator_type: "client",
      departed_at: now,
      created_by_staff_id: "smoke",
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.collection("box_inbound_links").insertMany([
    {
      box_id: box1,
      outbound_id: ob_id,
      inbound_id: inb1,
      linked_at: now,
      unlinked_at: null,
    },
    {
      box_id: box2,
      outbound_id: ob_id,
      inbound_id: inb2,
      linked_at: now,
      unlinked_at: null,
    },
  ]);
  console.log("✓ seeded 1 departed outbound (Fuuffy/UPS) with 2 boxes");

  // ── 2) List ─────────────────────────────────────────────
  const { listShippedOutbounds, getShippedDetail } = await import(
    "../src/services/outbound/shipped.ts"
  );
  const list = await listShippedOutbounds({ client_id });
  if (list.items.length !== 1) {
    throw new Error(`expected 1 item, got ${list.items.length}`);
  }
  const h = list.items[0];
  if (h.tracking_summary.primary_tracking_no !== "1ZB87K338634800548") {
    throw new Error(
      `unexpected primary tracking: ${h.tracking_summary.primary_tracking_no}`
    );
  }
  if (h.tracking_summary.additional_count !== 1) {
    throw new Error(
      `expected 1 additional tracking, got ${h.tracking_summary.additional_count}`
    );
  }
  if (
    h.carrier.tracking_url_template !==
    "https://www.ups.com/track?loc=zh_HK&tracknum={tracking_no}"
  ) {
    throw new Error(
      `unexpected tracking_url_template: ${h.carrier.tracking_url_template}`
    );
  }
  if (h.total_boxes !== 2 || h.total_inbound_count !== 2) {
    throw new Error(
      `expected 2 boxes + 2 inbounds, got ${h.total_boxes}/${h.total_inbound_count}`
    );
  }
  console.log(
    `✓ list returned 1 outbound · 2 boxes · primary tracking ${h.tracking_summary.primary_tracking_no} · UPS template ok`
  );

  // ── 3) Search by tracking ───────────────────────────────
  const searched = await listShippedOutbounds({
    client_id,
    search: "1ZB87K338600",
  });
  if (searched.items.length !== 1) {
    throw new Error(
      `search by partial tracking should find 1, got ${searched.items.length}`
    );
  }
  console.log("✓ search by partial tracking number works");

  // ── 4) Search by recipient name ─────────────────────────
  const byName = await listShippedOutbounds({
    client_id,
    search: "Jason",
  });
  if (byName.items.length !== 1) {
    throw new Error(`search by name should find 1, got ${byName.items.length}`);
  }
  console.log("✓ search by recipient name works");

  // ── 5) Search miss ───────────────────────────────────────
  const miss = await listShippedOutbounds({
    client_id,
    search: "NONEXISTENT",
  });
  if (miss.items.length !== 0) {
    throw new Error(`miss should return 0, got ${miss.items.length}`);
  }
  console.log("✓ search miss returns empty");

  // ── 6) Detail ────────────────────────────────────────────
  const detail = await getShippedDetail(client_id, ob_id);
  if (detail.boxes.length !== 2) {
    throw new Error(`expected 2 boxes in detail, got ${detail.boxes.length}`);
  }
  const declaredCount = detail.boxes.reduce(
    (s, b) =>
      s + b.inbound_items.reduce((s2, i) => s2 + i.declared_items.length, 0),
    0
  );
  if (declaredCount !== 3) {
    throw new Error(`expected 3 declared items joined, got ${declaredCount}`);
  }
  console.log(
    `✓ detail: ${detail.boxes.length} boxes, ${declaredCount} declared items joined`
  );

  // ── 7) Client-scope guard ────────────────────────────────
  let scopeErr = null;
  try {
    await getShippedDetail("ffffffffffffffffffffffff", ob_id);
  } catch (e) {
    scopeErr = e;
  }
  if (!scopeErr || scopeErr.name !== "OUTBOUND_REQUEST_NOT_FOUND") {
    throw new Error(
      `expected OUTBOUND_REQUEST_NOT_FOUND for wrong client, got ${scopeErr?.name}`
    );
  }
  console.log("✓ wrong-client detail access properly 404s");

  // ── 8) URL build correctness ─────────────────────────────
  const built = h.carrier.tracking_url_template.replace(
    "{tracking_no}",
    encodeURIComponent(h.tracking_summary.primary_tracking_no)
  );
  const expected =
    "https://www.ups.com/track?loc=zh_HK&tracknum=1ZB87K338634800548";
  if (built !== expected) {
    throw new Error(`URL build mismatch: ${built} vs ${expected}`);
  }
  console.log(`✓ UPS tracking URL builds correctly: ${built}`);

  await mc.close();
  console.log("\n✅ P9 smoke passed");
}

main().catch((e) => {
  console.error("❌ smoke failed:", e?.message ?? e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});

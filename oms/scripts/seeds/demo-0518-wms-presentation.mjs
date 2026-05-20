// Demo seed for 2026-05-18 WMS presentation.
//
// Distribution:
//   wms-test-a@example.com  →  4 consolidated + 1 single (direct ship)
//   wms-test-b@example.com  →  5 consolidated
//   wms-test-c@example.com  →  4 consolidated + 1 single (direct ship)
//
// Flow performed by this script:
//   1. Create 15 pending inbounds (I-20260518-0001 ~ 0015) with controlled
//      shipment_type so the singles fall on exactly the two slots above.
//   2. Receive + putaway all 15 directly in DB (skip walletService /
//      audit / notifications — this is seed, not a real PDA scan).
//      Each inbound is placed on a unique shelf A001..A015 so the
//      location-driven picker has variety.
//   3. Auto-create the 2 single → outbound passthroughs via
//      autoCreateOutboundFromSingleInbound.
//   4. Create the 4 consolidated outbounds:
//        A: [0001,0002,0003,0004] → HK  confirm_before_label
//        B: [0006,0007,0008]      → HK  auto
//        B: [0009,0010]           → TW  confirm_before_label
//        C: [0011,0012,0013,0014] → JP  auto
//      (inbound 0005 is A's single, 0015 is C's single — they're auto-created above)
//
// Outbounds end up at status="ready_for_label" with no batch_id, so the
// WMS 揀貨任務 page shows 6 batchable rows ready to wave.
//
// Run: cd oms && npx tsx scripts/seeds/demo-0518-wms-presentation.mjs

import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const URI = process.env.MONGODB_URI || "mongodb://localhost:27017/?replicaSet=rs0";
const DB = process.env.MONGODB_DB || "vw_sms";
const WAREHOUSE_CODE = "JP-SAITAMA-01";
const BATCH_DATE = "20260518";

const CLIENT_EMAILS = [
  "wms-test-a@example.com",
  "wms-test-b@example.com",
  "wms-test-c@example.com",
];

// 15 slots — null = consolidated, "single" = single direct ship.
// Index 0..4 → client A, 5..9 → B, 10..14 → C.
const SHIPMENT_PLAN = [
  null, null, null, null, "single",      // A: 4 consol + 1 single (0005)
  null, null, null, null, null,           // B: 5 consol
  null, null, null, null, "single",      // C: 4 consol + 1 single (0015)
];

const CARRIERS = ["sagawa", "japan_post", "yamato", "seino", "fukuyama"];
const SOURCES = ["regular", "regular", "regular", "return", "gift"];
const SIZES = ["small", "small", "medium", "medium", "large"];

const SUBCATS = [
  ["cat_01_sub01", "cat_01", ["UNIQLO 女裝 T-shirt", "GU 連衣裙", "ZARA 風衣"]],
  ["cat_01_sub04", "cat_01", ["Onitsuka Tiger 運動鞋", "ABC-MART 皮鞋", "New Balance 990"]],
  ["cat_02_sub01", "cat_02", ["SK-II 神仙水", "資生堂 紅腰子精華", "Curel 保濕乳"]],
  ["cat_02_sub04", "cat_02", ["白い恋人 12 入", "東京香蕉蛋糕", "ROYCE 生巧克力"]],
  ["cat_03_sub01", "cat_03", ["iPad Air M2 11吋", "MacBook Air 13"]],
  ["cat_03_sub03", "cat_03", ["iPhone 16 Pro", "AirPods Pro 2"]],
  ["cat_03_sub04", "cat_03", ["Switch 健身環", "Switch Pro 手把"]],
  ["cat_07_sub02", "cat_07", ["LEGO Star Wars X-Wing", "LEGO Technic 法拉利"]],
];

const RECEIVER_ADDRESSES = {
  HK: {
    name: "陳大文",
    phone: "+852-9100-1111",
    country_code: "HK",
    city: "Kwun Tong",
    district: "Kowloon",
    address: "Demo Tower 8/F Unit B",
    postal_code: "",
  },
  TW: {
    name: "林志明",
    phone: "+886-2-2700-2222",
    country_code: "TW",
    city: "台北市",
    district: "信義區",
    address: "信義路五段 7 號 32 樓",
    postal_code: "110",
  },
  JP: {
    name: "佐藤健",
    phone: "+81-3-3500-3333",
    country_code: "JP",
    city: "Tokyo",
    district: "Shinjuku",
    address: "Nishi-Shinjuku 1-1-1, Building 5F",
    postal_code: "1600023",
  },
};

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
function jpTrackingNo() {
  return `${randInt(1000, 9999)}${randInt(1000, 9999)}${randInt(1000, 9999)}`;
}

function buildItems() {
  const n = randInt(1, 3);
  const items = [];
  for (let i = 0; i < n; i++) {
    const [subId, catId, pool] = rand(SUBCATS);
    const name = rand(pool);
    const qty = randInt(1, 4);
    const unit = randInt(1000, 18000);
    items.push({
      category_id: catId,
      subcategory_id: subId,
      product_name: name,
      product_url: null,
      quantity: qty,
      unit_price: unit,
      currency: "JPY",
      subtotal: qty * unit,
    });
  }
  return items;
}

async function bumpDailyCounter(db, prefix, date, n) {
  const key = `${prefix}_${date}`;
  const res = await db.collection("daily_counters").findOneAndUpdate(
    { _id: key },
    { $inc: { counter: n }, $set: { last_used_at: new Date() } },
    { upsert: true, returnDocument: "after" }
  );
  const doc = res?.value ?? res;
  return doc?.counter ?? n;
}

async function main() {
  const c = new MongoClient(URI);
  await c.connect();
  const db = c.db(DB);

  // ── 1. resolve clients + carrier accounts ──────────────────
  const clients = await db
    .collection("clients")
    .find({ email: { $in: CLIENT_EMAILS } })
    .toArray();
  if (clients.length !== 3) {
    throw new Error(`Expected 3 clients, got ${clients.length}. Run p10-wms-test-seed.mjs first.`);
  }
  const clientByEmail = Object.fromEntries(clients.map((cl) => [cl.email, cl]));
  const clientList = CLIENT_EMAILS.map((e) => clientByEmail[e]);

  const clientHexs = clientList.map((cl) => String(cl._id));
  const accounts = await db
    .collection("client_carrier_accounts")
    .find({ client_id: { $in: clientHexs }, status: "active", deleted_at: null })
    .toArray();
  const accountByClient = Object.fromEntries(
    accounts.map((a) => [a.client_id, String(a._id)])
  );
  for (const cl of clientList) {
    if (!accountByClient[String(cl._id)]) {
      throw new Error(`Missing fuuffy carrier account for ${cl.email}`);
    }
  }

  // ── 2. idempotency: if 0518 batch already exists, reuse those IDs ──
  const existing = await db
    .collection("inbound_requests")
    .find({ _id: /^I-20260518-/ })
    .project({ _id: 1, shipment_type: 1, status: 1 })
    .sort({ _id: 1 })
    .toArray();
  let inboundIds;
  if (existing.length >= 15) {
    inboundIds = existing.slice(0, 15).map((d) => d._id);
    console.log(`  → existing batch detected: ${inboundIds[0]} ~ ${inboundIds[14]} (skip create+receive)`);
  } else {
    if (existing.length > 0) {
      throw new Error(
        `Partial 0518 batch (${existing.length}/15). Wipe with: db.inbound_requests.deleteMany({_id:/^I-20260518-/}); db.item_locations.deleteMany({itemCode:/^I-20260518-/}); db.inbound_declared_items.deleteMany({inbound_request_id:/^I-20260518-/});`
      );
    }
    const finalCounter = await bumpDailyCounter(db, "I", BATCH_DATE, 15);
    const startCounter = finalCounter - 15 + 1;
    inboundIds = [];
    for (let i = 0; i < 15; i++) {
      const n = startCounter + i;
      inboundIds.push(`I-${BATCH_DATE}-${String(n).padStart(4, "0")}`);
    }
  }

  // ── 3. create 15 pending inbounds (skip if reused) ─────────
  const skipCreate = existing.length >= 15;
  if (!skipCreate) {
  console.log(`\n→ creating 15 inbounds (${inboundIds[0]} ~ ${inboundIds[14]})`);
  const now0 = new Date();
  const inboundDocs = [];
  const declaredDocs = [];
  for (let i = 0; i < 15; i++) {
    const client = clientList[Math.floor(i / 5)];
    const clientHex = String(client._id);
    const items = buildItems();
    const declaredTotal = items.reduce((s, it) => s + it.subtotal, 0);
    const shipmentType = SHIPMENT_PLAN[i] === "single" ? "single" : "consolidated";
    const tracking = jpTrackingNo();
    const _id = inboundIds[i];

    const singleShipping =
      shipmentType === "single"
        ? {
            receiver_address: {
              name: client.contact_name,
              phone: client.phone,
              country_code: "HK",
              city: "Kwun Tong",
              district: "Kowloon",
              address: `Demo 直發 Building ${randInt(1, 30)}/F Flat ${randInt(1, 99)}`,
              postal_code: "",
            },
            carrier_account_id: accountByClient[clientHex],
          }
        : null;

    inboundDocs.push({
      _id,
      client_id: clientHex,
      warehouseCode: WAREHOUSE_CODE,
      carrier_inbound_code: rand(CARRIERS),
      tracking_no: tracking,
      tracking_no_normalized: tracking.replace(/[\s-]/g, "").toLowerCase(),
      tracking_no_other: null,
      inbound_source: rand(SOURCES),
      size_estimate: rand(SIZES),
      size_estimate_note: null,
      contains_liquid: false,
      contains_battery: false,
      shipment_type: shipmentType,
      single_shipping: singleShipping,
      customer_remarks: null,
      declared_value_total: declaredTotal,
      declared_currency: "JPY",
      declared_items_count: items.length,
      status: "pending",
      cancelled_at: null,
      cancelled_by_client: null,
      cancel_reason: null,
      abandoned_at: null,
      abandoned_by_client: null,
      abandoned_by_staff_id: null,
      abandoned_reason: null,
      abandon_warning_sent_at: null,
      arrivedAt: null,
      receivedAt: null,
      actualWeight: null,
      actualDimension: null,
      createdAt: now0,
      updatedAt: now0,
    });
    items.forEach((it, idx) => {
      declaredDocs.push({
        inbound_request_id: _id,
        client_id: clientHex,
        category_id: it.category_id,
        subcategory_id: it.subcategory_id,
        product_name: it.product_name,
        product_url: null,
        quantity: it.quantity,
        unit_price: it.unit_price,
        currency: it.currency,
        subtotal: it.subtotal,
        display_order: idx,
        createdAt: now0,
        updatedAt: now0,
      });
    });
  }
  await db.collection("inbound_requests").insertMany(inboundDocs);
  await db.collection("inbound_declared_items").insertMany(declaredDocs);
  console.log(`  ✓ 15 inbounds inserted (status=pending)`);
  } // end skipCreate guard

  // ── 4. receive + putaway (direct DB — skip walletService) ──
  if (!skipCreate) {
  console.log(`\n→ receiving + putaway 15 inbounds → status=received, shelves A001..A015`);
  const now1 = new Date();
  const placedBy = "demo-seed-0518";
  const itemLocOps = [];
  const inboundUpdates = [];
  for (let i = 0; i < 15; i++) {
    const _id = inboundIds[i];
    const shelf = `A${String(i + 1).padStart(3, "0")}`;
    itemLocOps.push({
      updateOne: {
        filter: { itemCode: _id },
        update: {
          $set: {
            itemCode: _id,
            itemType: "shipment",
            warehouseCode: WAREHOUSE_CODE,
            locationCode: shelf,
            currentStatus: "in_storage",
            placedBy,
            lastMovedAt: now1,
            updatedAt: now1,
          },
          $setOnInsert: { createdAt: now1 },
        },
        upsert: true,
      },
    });
    inboundUpdates.push({
      updateOne: {
        filter: { _id, status: "pending" },
        update: {
          $set: {
            status: "received",
            arrivedAt: now1,
            receivedAt: now1,
            actualWeight: 1, // kg — keep low so 4-package consolidations stay under fuuffy 20kg cap
            actualDimension: { length: 8, width: 6, height: 4 },
            updatedAt: now1,
          },
        },
      },
    });
  }
  await db.collection("item_locations").bulkWrite(itemLocOps);
  await db.collection("inbound_requests").bulkWrite(inboundUpdates);
  console.log(`  ✓ 15 inbounds received + placed on shelves A001..A015`);
  } // end skipCreate guard for receive

  // ── 5. auto-create the 2 single outbounds ──────────────────
  console.log(`\n→ auto-creating 2 single (直發) outbounds`);
  const { autoCreateOutboundFromSingleInbound, createConsolidatedOutbound } =
    await import("../../src/services/outbound/outbound-service.ts");

  const singleResults = [];
  for (let i = 0; i < 15; i++) {
    if (SHIPMENT_PLAN[i] !== "single") continue;
    const inbDoc = await db.collection("inbound_requests").findOne({ _id: inboundIds[i] });
    try {
      const out = await autoCreateOutboundFromSingleInbound(inbDoc);
      singleResults.push({ inbound: inboundIds[i], outbound: out._id, status: out.status });
      console.log(`  ✓ ${inboundIds[i]}  →  ${out._id}  status=${out.status}  (direct ship)`);
    } catch (e) {
      console.log(`  ✗ ${inboundIds[i]} FAILED: ${e?.code ?? e?.message ?? e}`);
    }
  }

  // ── 6. create 4 consolidated outbounds ─────────────────────
  console.log(`\n→ creating 4 consolidated outbounds`);
  const CONSOLIDATED_PLAN = [
    {
      email: "wms-test-a@example.com",
      inbound_idx: [0, 1, 2, 3], // 0001..0004 → HK
      country: "HK",
      pref: "auto",
    },
    {
      email: "wms-test-b@example.com",
      inbound_idx: [5, 6, 7], // 0006..0008 → HK
      country: "HK",
      pref: "auto",
    },
    {
      email: "wms-test-b@example.com",
      inbound_idx: [8, 9], // 0009..0010 → HK
      country: "HK",
      pref: "auto",
    },
    {
      email: "wms-test-c@example.com",
      inbound_idx: [10, 11, 12, 13], // 0011..0014 → HK
      country: "HK",
      pref: "auto",
    },
  ];

  const consolResults = [];
  for (const plan of CONSOLIDATED_PLAN) {
    const client = clientByEmail[plan.email];
    const clientHex = String(client._id);
    const payload = {
      inbound_ids: plan.inbound_idx.map((i) => inboundIds[i]),
      carrier_code: "fuuffy",
      carrier_account_id: accountByClient[clientHex],
      receiver_address: RECEIVER_ADDRESSES[plan.country],
      processing_preference: plan.pref,
    };
    try {
      const out = await createConsolidatedOutbound({ client_id: clientHex }, payload);
      consolResults.push({
        outbound: out._id,
        client: plan.email.split("@")[0],
        country: plan.country,
        pref: plan.pref,
        inbounds: payload.inbound_ids.length,
        status: out.status,
      });
      console.log(
        `  ✓ ${out._id}  ${plan.email.split("@")[0]}  →${plan.country}  ${plan.pref}  inbounds=${payload.inbound_ids.length}  status=${out.status}`
      );
    } catch (e) {
      console.log(`  ✗ FAILED ${plan.email} → ${plan.country}: ${e?.code ?? e?.message ?? e}`);
    }
  }

  // ── 7. summary ─────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`Demo 2026-05-18 ready.`);
  console.log(`  Inbounds:   15 (${inboundIds[0]} ~ ${inboundIds[14]}), all status=received`);
  console.log(`  Outbounds:  ${singleResults.length} direct ship + ${consolResults.length} consolidated = ${singleResults.length + consolResults.length} total`);
  console.log(`\n  Direct ship (single):`);
  singleResults.forEach((r) =>
    console.log(`    ${r.outbound}  ←  ${r.inbound}  status=${r.status}`)
  );
  console.log(`\n  Consolidated:`);
  consolResults.forEach((r) =>
    console.log(`    ${r.outbound}  ${r.client}  →${r.country}  ${r.pref}  ×${r.inbounds}  status=${r.status}`)
  );
  console.log(`\n  Next step (live demo): open WMS 揀貨任務 page → 6 outbounds ready to batch.`);
  console.log(`══════════════════════════════════════════════════════════\n`);

  await c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

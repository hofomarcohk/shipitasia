// P17 — seed for the 集運 (manual_consolidate) WMS flow test.
//
// Creates 3 clients × 4 inbounds = 12 pending inbound_requests, all in
// JP-SAITAMA-01, all shipping_mode="manual_consolidate", no YT, all
// SF-prefixed tracking. Customers (SIA0004 / SIA0005 / SIA0006) are
// expected to already exist (seeded by p10-wms-test-seed.mjs).
//
// At outbound creation in OMS the user can route all 3 client outbounds
// to the same HK destination so the WMS weigh page demonstrates the
// "same client + same destination" continuous-scan group lock.
//
// Run: node scripts/seeds/p17-consol-hk-test.mjs

import { MongoClient } from "mongodb";

const URI =
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true";
const DB = process.env.MONGODB_NAME || "vw_sms";

const WAREHOUSE = "JP-SAITAMA-01";
const CLIENT_CODES = ["SIA0004", "SIA0005", "SIA0006"];

const PRODUCTS = [
  { cat: "cat_01", sub: "cat_01_sub01", name: "UNIQLO 女裝 T-shirt", unit: 1200 },
  { cat: "cat_01", sub: "cat_01_sub02", name: "Beams 男裝外套", unit: 8500 },
  { cat: "cat_01", sub: "cat_01_sub04", name: "Onitsuka Tiger 運動鞋", unit: 9800 },
  { cat: "cat_01", sub: "cat_01_sub05", name: "Porter 公文包", unit: 18500 },
  { cat: "cat_02", sub: "cat_02_sub01", name: "資生堂 紅腰子精華", unit: 9200 },
  { cat: "cat_02", sub: "cat_02_sub02", name: "FANCL 綜合維他命", unit: 3800 },
  { cat: "cat_02", sub: "cat_02_sub04", name: "白い恋人 12 入", unit: 1500 },
  { cat: "cat_03", sub: "cat_03_sub03", name: "AirPods Pro 2", unit: 29800 },
];

function randInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
function pickN(arr, n) {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
  }
  return out;
}
function sfTracking() {
  // SF format: SF + 12 digits — guaranteed non-YT so classifyArrival
  // routes these to the consolidated forecast path.
  return `SF${randInt(100000000000, 999999999999)}`;
}

async function nextDailyId(db, prefix, date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}${mm}${dd}`;
  const key = `${prefix}_${dateStr}`;
  const res = await db
    .collection("daily_counters")
    .findOneAndUpdate(
      { _id: key },
      { $inc: { counter: 1 }, $set: { last_used_at: new Date() } },
      { upsert: true, returnDocument: "after" }
    );
  const doc = res?.value ?? res;
  const counter = doc?.counter ?? 1;
  return `${prefix}-${dateStr}-${String(counter).padStart(4, "0")}`;
}

function buildItems() {
  const picks = pickN(PRODUCTS, randInt(1, 3));
  return picks.map((p, i) => {
    const qty = randInt(1, 4);
    return {
      category_id: p.cat,
      subcategory_id: p.sub,
      product_name: p.name,
      product_url: null,
      quantity: qty,
      unit_price: p.unit,
      currency: "JPY",
      subtotal: qty * p.unit,
      display_order: i,
    };
  });
}

async function createInbound(db, client, seq) {
  const inbound_id = await nextDailyId(db, "I");
  const items = buildItems();
  const declared_value_total = items.reduce((s, it) => s + it.subtotal, 0);
  const tracking = sfTracking();
  const now = new Date();

  // Each client's 4 inbounds use one of these carriers so the
  // 外箱條碼 column varies.
  const carriers = ["yamato", "japan_post", "sagawa", "fukuyama"];
  const carrier = carriers[seq % carriers.length];

  const clientHex = String(client._id);
  await db.collection("inbound_requests").insertOne({
    _id: inbound_id,
    client_id: clientHex,
    warehouseCode: WAREHOUSE,
    carrier_inbound_code: carrier,
    tracking_no: tracking,
    tracking_no_normalized: tracking.toLowerCase(),
    tracking_no_other: null,
    inbound_source: "regular",
    size_estimate: seq < 2 ? "small" : "medium",
    size_estimate_note: null,
    contains_liquid: false,
    contains_battery: false,
    shipping_mode: "manual_consolidate",
    shipping_destination: null,
    consolidation_group_id: null,
    customer_remarks: seq === 0 ? "請小心輕放" : null,
    declared_value_total,
    declared_currency: "JPY",
    declared_items_count: items.length,
    status: "pending",
    cancelled_at: null,
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
    is_yt: false,
    createdAt: now,
    updatedAt: now,
  });

  // declared items as separate rows (matches v1 schema).
  const itemDocs = items.map((it, i) => ({
    _id: `${inbound_id}-item-${i + 1}`,
    inbound_request_id: inbound_id,
    ...it,
  }));
  await db.collection("inbound_declared_items").insertMany(itemDocs);

  return { inbound_id, tracking, items: items.length, value: declared_value_total };
}

async function main() {
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db(DB);
  console.log(`connected → ${DB}`);

  const clients = await db
    .collection("clients")
    .find({ code: { $in: CLIENT_CODES } })
    .toArray();
  if (clients.length !== 3) {
    throw new Error(
      `expected 3 clients (${CLIENT_CODES.join(", ")}); found ${clients.length}. ` +
        `run scripts/seeds/p10-wms-test-seed.mjs first to seed them.`
    );
  }

  console.log("\nseeding 4 manual_consolidate inbounds per client:\n");
  for (const c of clients) {
    console.log(`▸ ${c.code} (${c.company_name})`);
    for (let i = 0; i < 4; i++) {
      const r = await createInbound(db, c, i);
      console.log(
        `    ${r.inbound_id}  tracking=${r.tracking}  items=${r.items}  value=¥${r.value}`
      );
    }
  }

  console.log("\nDone. Next steps:");
  console.log("  1. Login as test@xxx.com (admin) at /zh-hk/login");
  console.log("  2. PDA arrive scan each tracking to advance status → arrived");
  console.log("     OR use the WMS desktop receive page (/wms/operations/receive)");
  console.log("  3. After all 4 inbounds for a client are received, OMS portal");
  console.log("     creates a consolidated outbound covering all 4, destined to");
  console.log("     the same HK address.");
  console.log("  4. WMS pick-batch → pack → weigh → print → depart.\n");

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

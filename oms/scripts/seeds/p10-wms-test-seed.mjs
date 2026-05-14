// P10 — seed 3 clients + 20 pending inbound_requests for WMS testing.
//
// Run: node scripts/seeds/p10-wms-test-seed.mjs
//
// Idempotent on clients (upsert by email) and inbounds (re-running adds
// more rows — daily counter handles uniqueness). Safe to run multiple
// times.

import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcrypt";

const URI = process.env.MONGODB_URI || "mongodb://localhost:27017/?replicaSet=rs0";
const DB = process.env.MONGODB_DB || "vw_sms";

const CLIENTS = [
  {
    email: "wms-test-a@example.com",
    company_name: "WMS Test A 株式会社",
    contact_name: "Sato Aiko",
    phone: "+81-3-1111-0001",
  },
  {
    email: "wms-test-b@example.com",
    company_name: "WMS Test B Trading Co",
    contact_name: "陳大文",
    phone: "+852-9100-2002",
  },
  {
    email: "wms-test-c@example.com",
    company_name: "WMS Test C Logistics",
    contact_name: "Lee Min-jun",
    phone: "+82-2-3000-0003",
  },
];

const PASSWORD = "test1234";

const WAREHOUSE_CODE = "JP-SAITAMA-01";
const CARRIERS = ["sagawa", "japan_post", "yamato", "seino", "fukuyama"];
const SOURCES = ["regular", "regular", "regular", "return", "gift"];
const SIZES = ["small", "small", "medium", "medium", "large"];

const SUBCATS = [
  // [subcategory_id, parent category_id, product_name_pool]
  ["cat_01_sub01", "cat_01", ["UNIQLO 女裝 T-shirt", "GU 連衣裙", "ZARA 風衣"]],
  ["cat_01_sub02", "cat_01", ["Beams 男裝外套", "UNITED ARROWS 西裝褲"]],
  ["cat_01_sub04", "cat_01", ["Onitsuka Tiger 運動鞋", "ABC-MART 皮鞋", "New Balance 990"]],
  ["cat_01_sub05", "cat_01", ["Porter 公文包", "Master-piece 後背包"]],
  ["cat_02_sub01", "cat_02", ["SK-II 神仙水", "資生堂 紅腰子精華", "Curel 保濕乳"]],
  ["cat_02_sub02", "cat_02", ["DHC 葉黃素", "FANCL 綜合維他命"]],
  ["cat_02_sub03", "cat_02", ["花王 BIORE 卸妝棉", "Lion 牙膏"]],
  ["cat_02_sub04", "cat_02", ["白い恋人 12 入", "東京香蕉蛋糕", "ROYCE 生巧克力"]],
  ["cat_03_sub01", "cat_03", ["iPad Air M2 11吋", "MacBook Air 13"]],
  ["cat_03_sub02", "cat_03", ["RTX 4070 顯卡", "Crucial DDR5 32GB"]],
  ["cat_03_sub03", "cat_03", ["iPhone 16 Pro", "AirPods Pro 2"]],
  ["cat_03_sub04", "cat_03", ["Switch 健身環", "Switch Pro 手把"]],
  ["cat_03_sub05", "cat_03", ["PS5 Slim", "DualSense 控制器"]],
  ["cat_07_sub01", "cat_07", ["TOMICA 跑車組 6 入", "BANDAI 鋼彈模型 MG"]],
  ["cat_07_sub02", "cat_07", ["LEGO Star Wars X-Wing", "LEGO Technic 法拉利"]],
  ["cat_05_sub01", "cat_05", ["Zojirushi 象印電飯煲", "Panasonic 麵包機"]],
];

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
function jpTrackingNo() {
  // Japan Post style: 4 digits + 4 digits + 4 digits
  return `${randInt(1000, 9999)}${randInt(1000, 9999)}${randInt(1000, 9999)}`;
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

function objectIdHex() {
  // Returns a real BSON ObjectId. Older revisions of this seed returned a
  // 24-char STRING — wallet/auth code does `new ObjectId(client._id)` and
  // expects ObjectId-typed _id, so the string version threw INVALID_CREDENTIALS
  // on every receive after the inbound update had already committed.
  return new ObjectId();
}

async function nextSiaCode(db) {
  // SIA0000 is reserved for the admin (test@xxx.com). Other clients
  // sequence from SIA0001 — pick the smallest unused number above zero.
  const rows = await db
    .collection("clients")
    .find({ code: { $regex: "^SIA[0-9]{4}$" } })
    .project({ code: 1 })
    .toArray();
  const used = new Set(rows.map((r) => r.code));
  for (let n = 1; n < 10000; n++) {
    const code = "SIA" + String(n).padStart(4, "0");
    if (!used.has(code)) return code;
  }
  throw new Error("SIA code pool exhausted");
}

async function upsertClients(db) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const out = [];
  for (const c of CLIENTS) {
    const existing = await db.collection("clients").findOne({ email: c.email });
    if (existing) {
      console.log(`  client exists: ${c.email} (${existing._id} / ${existing.code ?? "no-code"})`);
      out.push(existing);
      continue;
    }
    const _id = objectIdHex();
    const now = new Date();
    const code = await nextSiaCode(db);
    const doc = {
      _id,
      email: c.email,
      code,
      password: hash,
      company_name: c.company_name,
      contact_name: c.contact_name,
      country: "JP",
      phone: c.phone,
      email_verified: true,
      email_verified_at: now,
      status: "active",
      onboarding_completed: true,
      balance: 100000,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("clients").insertOne(doc);
    console.log(`  client created: ${c.email} (${_id} / ${code})`);
    out.push(doc);
  }
  return out;
}

// Give each test client a real client_carrier_account so single 直發 inbound
// has a valid carrier_account_id (the lookup runs new ObjectId() on it).
// Returns Map<client_id, account_id_hex>.
async function upsertCarrierAccounts(db, clients) {
  // FK fields like client_carrier_accounts.client_id are stored as the
  // 24-char hex STRING form of the client's _id (the rest of the project
  // expects that shape on filters / inserts). We extract the hex once here
  // and keep using strings on the FK side.
  const map = new Map();
  for (const cl of clients) {
    const clientHex = String(cl._id);
    const existing = await db
      .collection("client_carrier_accounts")
      .findOne({ client_id: clientHex, status: "active", deleted_at: null });
    if (existing) {
      map.set(clientHex, String(existing._id));
      console.log(`  carrier_account exists for ${cl.email}: ${existing._id}`);
      continue;
    }
    const oid = new ObjectId();
    const now = new Date();
    await db.collection("client_carrier_accounts").insertOne({
      _id: oid,
      client_id: clientHex,
      carrier_code: "fuuffy",
      account_label: "Test fuuffy account",
      auth_payload: { token: "test-token" },
      status: "active",
      deleted_at: null,
      createdAt: now,
      updatedAt: now,
    });
    const hex = String(oid);
    map.set(clientHex, hex);
    console.log(`  carrier_account created for ${cl.email}: ${hex}`);
  }
  return map;
}

function buildItems() {
  const n = randInt(1, 4);
  const items = [];
  for (let i = 0; i < n; i++) {
    const [subId, catId, pool] = rand(SUBCATS);
    const name = rand(pool);
    const qty = randInt(1, 5);
    const unit = randInt(800, 25000); // JPY
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

async function createInbound(db, client, idx, accountMap) {
  const shipmentType = Math.random() < 0.8 ? "consolidated" : "single";
  const items = buildItems();
  const declared_value_total = items.reduce((s, it) => s + it.subtotal, 0);
  const inbound_id = await nextDailyId(db, "I");

  // Random cargo flags — bias toward "neither" but include real cases.
  const r = Math.random();
  const contains_battery = r < 0.2; // 20%
  const contains_liquid = !contains_battery && r > 0.85; // 15%

  const tracking = jpTrackingNo();
  const trackingNorm = tracking.replace(/[\s-]/g, "").toLowerCase();
  const now = new Date();

  const singleShipping =
    shipmentType === "single"
      ? {
          receiver_address: {
            name: client.contact_name,
            phone: client.phone,
            country_code: "HK",
            city: "Kwun Tong",
            district: "Kowloon",
            address: `Test Building ${randInt(1, 30)}/F Flat ${randInt(1, 99)}`,
            postal_code: "",
          },
          carrier_account_id: accountMap.get(String(client._id)),
        }
      : null;

  const clientHex = String(client._id);
  await db.collection("inbound_requests").insertOne({
    _id: inbound_id,
    client_id: clientHex,
    warehouseCode: WAREHOUSE_CODE,
    carrier_inbound_code: rand(CARRIERS),
    tracking_no: tracking,
    tracking_no_normalized: trackingNorm,
    tracking_no_other: null,
    inbound_source: rand(SOURCES),
    size_estimate: rand(SIZES),
    size_estimate_note: null,
    contains_liquid,
    contains_battery,
    shipment_type: shipmentType,
    single_shipping: singleShipping,
    customer_remarks: idx % 5 === 0 ? "請小心輕放" : null,
    declared_value_total,
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
    createdAt: now,
    updatedAt: now,
  });

  await db.collection("inbound_declared_items").insertMany(
    items.map((it, i) => ({
      inbound_request_id: inbound_id,
      client_id: clientHex,
      category_id: it.category_id,
      subcategory_id: it.subcategory_id,
      product_name: it.product_name,
      product_url: null,
      quantity: it.quantity,
      unit_price: it.unit_price,
      currency: "JPY",
      subtotal: it.subtotal,
      display_order: i,
      createdAt: now,
      updatedAt: now,
    }))
  );

  return {
    inbound_id,
    client: client.email,
    shipmentType,
    items: items.length,
    declared_value_total,
    contains_battery,
    contains_liquid,
  };
}

// How many inbounds to create per client. 4 per client × 3 clients = 12.
// Override via SEED_PER_CLIENT env if needed.
const PER_CLIENT = parseInt(process.env.SEED_PER_CLIENT || "4", 10);

async function main() {
  const c = new MongoClient(URI);
  await c.connect();
  const db = c.db(DB);
  const total = PER_CLIENT * 3;
  console.log(`→ Seeding ${CLIENTS.length} clients + ${total} inbounds in ${DB}`);

  const clients = await upsertClients(db);
  console.log(`\nClients ready (login password = "${PASSWORD}"):`);
  for (const cl of clients) console.log(`  - ${cl.email}`);

  console.log("\n→ Ensuring each client has a carrier account...");
  const accountMap = await upsertCarrierAccounts(db, clients);

  console.log(`\n→ Creating ${total} inbounds...`);
  const summary = [];
  for (let i = 0; i < total; i++) {
    const client = clients[i % clients.length]; // round-robin so each client gets some
    const r = await createInbound(db, client, i, accountMap);
    summary.push(r);
    console.log(
      `  [${i + 1}/${total}] ${r.inbound_id} · ${r.client.split("@")[0]} · ${r.shipmentType} · ${r.items} items · ¥${r.declared_value_total.toLocaleString()}${r.contains_battery ? " · 🔋" : ""}${r.contains_liquid ? " · 💧" : ""}`
    );
  }

  console.log(`\nDone. Status of all ${total} = "pending" (ready for PDA arrive scan).`);
  console.log(`Login any of the 3 test accounts at /zh-hk/login with password: ${PASSWORD}`);
  await c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

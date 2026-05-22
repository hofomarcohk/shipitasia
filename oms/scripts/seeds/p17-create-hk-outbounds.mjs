// P17 — create 3 consolidated outbounds to HK from the 12 shelved SF inbounds.
//
// One outbound per client (SIA0004/5/6), each containing that client's 4
// received SF-prefixed inbounds in JP-SAITAMA-01. Random HK address per
// client; same client always ships to one destination.
//
// Run: cd oms && node scripts/seeds/p17-create-hk-outbounds.mjs

import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const URI =
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true";
const DB = process.env.MONGODB_NAME || "vw_sms";

const WAREHOUSE = "JP-SAITAMA-01";
const CLIENT_CODES = ["SIA0004", "SIA0005", "SIA0006"];

const HK_ADDRESSES = [
  {
    name: "陳大文",
    phone: "+852-9100-1111",
    country_code: "HK",
    city: "Kwun Tong",
    district: "Kowloon",
    address: "Test Tower 8/F Unit B",
    postal_code: "",
  },
  {
    name: "李志強",
    phone: "+852-9200-2222",
    country_code: "HK",
    city: "Tsim Sha Tsui",
    district: "Kowloon",
    address: "Harbour City Tower 2 15/F Unit 1503",
    postal_code: "",
  },
  {
    name: "黃詠詩",
    phone: "+852-9300-3333",
    country_code: "HK",
    city: "Central",
    district: "Hong Kong",
    address: "IFC 2 28/F Unit A",
    postal_code: "",
  },
];

const PREFS = ["auto"]; // schema currently only accepts "auto"

async function main() {
  const c = new MongoClient(URI);
  await c.connect();
  const db = c.db(DB);

  const clients = await db
    .collection("clients")
    .find({ code: { $in: CLIENT_CODES } })
    .toArray();
  console.log(`Found ${clients.length} clients: ${clients.map((c) => c.code).join(", ")}`);

  const { createConsolidatedOutbound } = await import(
    "../../src/services/outbound/outbound-service.ts"
  );

  let ok = 0;
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const clientHex = String(client._id);

    const inbs = await db
      .collection("inbound_requests")
      .find({
        client_id: clientHex,
        warehouseCode: WAREHOUSE,
        tracking_no: /^SF/,
        status: "received",
      })
      .toArray();
    if (!inbs.length) {
      console.log(`  SKIP ${client.code} — no received SF inbounds`);
      continue;
    }

    const acc = await db.collection("client_carrier_accounts").findOne({
      client_id: clientHex,
      status: "active",
      deleted_at: null,
    });
    if (!acc) {
      console.log(`  SKIP ${client.code} — no active carrier account`);
      continue;
    }

    const addr = HK_ADDRESSES[i % HK_ADDRESSES.length];
    const pref = PREFS[Math.floor(Math.random() * PREFS.length)];

    try {
      const out = await createConsolidatedOutbound(
        { client_id: clientHex },
        {
          inbound_ids: inbs.map((x) => x._id),
          carrier_code: acc.carrier_code,
          carrier_account_id: String(acc._id),
          receiver_address: addr,
          processing_preference: pref,
        }
      );
      ok++;
      console.log(
        `  ✓ ${client.code}: outbound ${out._id} · ${inbs.length} inbounds · ${addr.city} · ${pref}`
      );
    } catch (e) {
      console.error(`  ✗ ${client.code} failed:`, e?.message ?? e);
    }
  }

  console.log(`\nCreated ${ok}/${clients.length} outbounds.`);
  await c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

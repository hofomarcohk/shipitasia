// P10 E2E test step — bulk-create consolidated outbounds for the 19 received
// inbounds across the 3 wms-test-X clients. Mixes destinations (HK/TW/JP/SG)
// and processing_preference so the pick-batch UI has variety to filter on.
//
// Run: cd oms && npx tsx scripts/seeds/p10-create-consolidated-outbounds.mjs

import "dotenv/config";
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI || "mongodb://localhost:27017/?replicaSet=rs0";
const DB = process.env.MONGODB_DB || "vw_sms";

// Each entry: [client_email, inbound_ids, country_code, processing_preference]
// 2026-05-14 batch: 9 consolidated inbounds across 3 clients → 5 outbounds.
const PLAN = [
  ["wms-test-a@example.com", ["I-20260514-0001", "I-20260514-0004"], "HK", "confirm_before_label"],
  ["wms-test-a@example.com", ["I-20260514-0007"], "HK", "auto"],

  ["wms-test-b@example.com", ["I-20260514-0002", "I-20260514-0008"], "HK", "auto"],

  ["wms-test-c@example.com", ["I-20260514-0003", "I-20260514-0006", "I-20260514-0009"], "HK", "confirm_before_label"],
  ["wms-test-c@example.com", ["I-20260514-0012"], "HK", "auto"],
];

const ADDRESSES = {
  HK: {
    name: "陳大文",
    phone: "+852-9100-1111",
    country_code: "HK",
    city: "Kwun Tong",
    district: "Kowloon",
    address: "Test Tower 8/F Unit B",
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
  SG: {
    name: "Tan Wei Ming",
    phone: "+65-6100-4444",
    country_code: "SG",
    city: "Singapore",
    district: "Orchard",
    address: "313 Orchard Road #15-08",
    postal_code: "238895",
  },
};

async function main() {
  const c = new MongoClient(URI);
  await c.connect();
  const db = c.db(DB);

  const clients = await db
    .collection("clients")
    .find({ email: { $in: PLAN.map((p) => p[0]) } })
    .toArray();
  const byEmail = Object.fromEntries(clients.map((c) => [c.email, c]));

  // client._id is BSON ObjectId but every FK (carrier_account.client_id,
  // ctx.client_id passed into services) is stored / expected as the hex
  // STRING. Coerce up front to dodge the type-mismatch traps.
  const clientHexs = clients.map((c) => String(c._id));
  const accounts = await db
    .collection("client_carrier_accounts")
    .find({
      client_id: { $in: clientHexs },
      status: "active",
      deleted_at: null,
    })
    .toArray();
  const accountByClient = Object.fromEntries(
    accounts.map((a) => [a.client_id, String(a._id)])
  );

  const { createConsolidatedOutbound } = await import(
    "../../src/services/outbound/outbound-service.ts"
  );

  process.stdout.write(`Creating ${PLAN.length} consolidated outbounds...\n`);

  let ok = 0;
  for (const [email, inboundIds, country, pref] of PLAN) {
    const client = byEmail[email];
    if (!client) {
      console.log(`  SKIP ${email} (not found)`);
      continue;
    }
    const clientHex = String(client._id);
    const accountId = accountByClient[clientHex];
    if (!accountId) {
      console.log(`  SKIP ${email} (no carrier account)`);
      continue;
    }
    const payload = {
      inbound_ids: inboundIds,
      carrier_code: "fuuffy",
      carrier_account_id: accountId,
      receiver_address: ADDRESSES[country],
      processing_preference: pref,
    };
    try {
      const out = await createConsolidatedOutbound(
        { client_id: clientHex },
        payload
      );
      process.stdout.write(
        `  ${out._id}  ${email.split("@")[0]}  ->${country}  ${pref}  status=${out.status}  inbounds=${inboundIds.length}\n`
      );
      ok += 1;
    } catch (e) {
      console.log(
        `  FAILED ${email} ${inboundIds.join(",")} -> ${country}: ${e?.code ?? e?.message ?? e}`
      );
    }
  }
  process.stdout.write(`\nDone. ${ok}/${PLAN.length} succeeded.\n`);
  await c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

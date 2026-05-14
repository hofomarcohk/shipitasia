// Wipe all operational (運單 / 入出庫 / scan / batch / pallet / wallet 動作)
// collections, reset test-client balances, and reset daily_counters so new
// IDs restart at NNNN-0001. Master data (clients / carriers / locations /
// menu_urls / migrations / saved_* / product_categories) is preserved.
//
// Run: cd oms && node scripts/seeds/wipe-operational.mjs

import "dotenv/config";
import { MongoClient } from "mongodb";

const URI =
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/?replicaSet=rs0";
const DB = process.env.MONGODB_DB || "vw_sms";

const WIPE = [
  "inbound_requests",
  "inbound_declared_items",
  "inbound_scans",
  "outbound_requests",
  "outbound_inbound_links",
  "outbound_boxes",
  "outbound_box_weights",
  "outbound_scans",
  "outbound_action_logs",
  "box_inbound_links",
  "item_locations",
  "pick_batches",
  "pallet_labels",
  "rate_quote_logs",
  "wallet_transactions",
  "notifications",
  "unclaimed_inbounds",
  "staff_handled_abandoned",
  "daily_counters",
];

async function main() {
  const c = new MongoClient(URI);
  await c.connect();
  const db = c.db(DB);

  console.log(`→ Wiping ${WIPE.length} operational collections from ${DB}`);
  for (const name of WIPE) {
    const before = await db.collection(name).estimatedDocumentCount();
    if (before === 0) {
      console.log(`  ${name}: already empty`);
      continue;
    }
    const r = await db.collection(name).deleteMany({});
    console.log(`  ${name}: removed ${r.deletedCount}`);
  }

  // Reset wms-test-{a,b,c} client balances to seeded HK$100,000 so the next
  // round of receive handling fees starts from a known baseline.
  const reset = await db.collection("clients").updateMany(
    { email: { $regex: "^wms-test-[abc]@" } },
    { $set: { balance: 100000, updatedAt: new Date() } }
  );
  console.log(`\nReset balance to HK$100,000 on ${reset.modifiedCount} test clients`);

  await c.close();
  console.log("\nDone. Next: run scripts/seeds/p10-wms-test-seed.mjs to re-create inbounds.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

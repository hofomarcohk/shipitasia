// One-off backfill: for every received single 直發 inbound that has no
// associated outbound, trigger the autoCreate path. Use after the P10
// receive-time autoCreate was added so historical seed data catches up.
//
// Run: cd oms && npx tsx scripts/seeds/p10-backfill-single-outbounds.mjs

import "dotenv/config";
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI || "mongodb://localhost:27017/?replicaSet=rs0";
const DB = process.env.MONGODB_DB || "vw_sms";

async function main() {
  const c = new MongoClient(URI);
  await c.connect();
  const db = c.db(DB);

  const singles = await db
    .collection("inbound_requests")
    .find({
      shipment_type: "single",
      status: "received",
      single_shipping: { $ne: null },
    })
    .toArray();

  console.log(`Found ${singles.length} received single inbounds`);

  const linked = new Set(
    (
      await db
        .collection("outbound_inbound_link")
        .find({ inbound_id: { $in: singles.map((s) => String(s._id)) }, unlinked_at: null })
        .toArray()
    ).map((l) => l.inbound_id)
  );

  const orphans = singles.filter((s) => !linked.has(String(s._id)));
  console.log(`Orphans (no outbound yet): ${orphans.length}`);
  if (orphans.length === 0) {
    await c.close();
    return;
  }

  // Import the service. The service expects to be called from a Node
  // runtime that has the project's tsconfig path aliases — we use the dev
  // server's compiled bundle if available, else require via tsx.
  const { autoCreateOutboundFromSingleInbound } = await import(
    "../../src/services/outbound/outbound-service.ts"
  );

  let ok = 0;
  for (const inb of orphans) {
    try {
      const out = await autoCreateOutboundFromSingleInbound(inb);
      console.log(`  ${inb._id} -> outbound ${out._id} (status ${out.status})`);
      ok += 1;
    } catch (e) {
      console.log(`  ${inb._id} FAILED: ${e?.code ?? e?.message ?? e}`);
    }
  }
  console.log(`\nDone. ${ok}/${orphans.length} succeeded.`);
  await c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

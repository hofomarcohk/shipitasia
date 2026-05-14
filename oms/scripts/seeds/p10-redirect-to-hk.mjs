// Cancel the 5 non-HK outbounds created by p10-create-consolidated-outbounds
// and re-create them as HK outbounds (Marco only wants HK destination this
// round). Keeps the same inbound groupings so batch sizes (2/3/3/2/2) stay
// varied for pick-batch testing.
//
// Run: cd oms && npx tsx scripts/seeds/p10-redirect-to-hk.mjs

import "dotenv/config";
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI || "mongodb://localhost:27017/?replicaSet=rs0";
const DB = process.env.MONGODB_DB || "vw_sms";

// outbound_id, client_email, inbound_ids, processing_preference
const REDIRECTS = [
  ["OUT-20260513-0010", "wms-test-a@example.com", ["I-20260513-0004", "I-20260513-0013"], "auto"],
  ["OUT-20260513-0011", "wms-test-a@example.com", ["I-20260513-0007", "I-20260513-0016", "I-20260513-0019"], "auto"],
  ["OUT-20260513-0013", "wms-test-b@example.com", ["I-20260513-0005", "I-20260513-0011", "I-20260513-0020"], "auto"],
  ["OUT-20260513-0015", "wms-test-c@example.com", ["I-20260513-0006", "I-20260513-0018"], "confirm_before_label"],
  ["OUT-20260513-0016", "wms-test-c@example.com", ["I-20260513-0012", "I-20260513-0015"], "auto"],
];

const HK_ADDR = {
  name: "陳大文",
  phone: "+852-9100-1111",
  country_code: "HK",
  city: "Kwun Tong",
  district: "Kowloon",
  address: "Test Tower 8/F Unit B",
  postal_code: "",
};

async function main() {
  const c = new MongoClient(URI);
  await c.connect();
  const db = c.db(DB);

  const clients = await db
    .collection("clients")
    .find({ email: { $in: REDIRECTS.map((r) => r[1]) } })
    .toArray();
  const byEmail = Object.fromEntries(clients.map((c) => [c.email, c]));
  const accounts = await db
    .collection("client_carrier_accounts")
    .find({
      client_id: { $in: clients.map((c) => c._id) },
      status: "active",
      deleted_at: null,
    })
    .toArray();
  const accountByClient = Object.fromEntries(
    accounts.map((a) => [a.client_id, String(a._id)])
  );

  const { cancelMyOutbound, createConsolidatedOutbound } = await import(
    "../../src/services/outbound/outbound-service.ts"
  );

  process.stdout.write(`Cancelling 5 non-HK outbounds + recreating as HK...\n`);

  for (const [outboundId, email, inboundIds, pref] of REDIRECTS) {
    const client = byEmail[email];
    if (!client) {
      console.log(`  SKIP ${outboundId}: client ${email} not found`);
      continue;
    }
    const ctx = { client_id: client._id };

    try {
      await cancelMyOutbound(ctx, outboundId, {
        cancel_reason: "destination 改 HK，重建",
      });
      process.stdout.write(`  cancelled ${outboundId}\n`);
    } catch (e) {
      console.log(`  FAILED to cancel ${outboundId}: ${e?.code ?? e?.message}`);
      continue;
    }

    try {
      const out = await createConsolidatedOutbound(ctx, {
        inbound_ids: inboundIds,
        carrier_code: "fuuffy",
        carrier_account_id: accountByClient[client._id],
        receiver_address: HK_ADDR,
        processing_preference: pref,
      });
      process.stdout.write(
        `  recreated -> ${out._id}  ${email.split("@")[0]}  ->HK  ${pref}  inbounds=${inboundIds.length}\n`
      );
    } catch (e) {
      console.log(
        `  FAILED to recreate (was ${outboundId}): ${e?.code ?? e?.message ?? e}`
      );
    }
  }
  process.stdout.write(`\nDone.\n`);
  await c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

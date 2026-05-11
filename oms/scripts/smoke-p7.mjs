// Phase 7 smoke test — outbound creation + held + release + cancel.
//
// Pre-req:
//   - MongoDB rs0 replica set running at localhost:27017
//   - .env present with MONGODB_URI + MONGODB_NAME
//   - P1-P6 master data seeded (carriers active, warehouses active,
//     carriers_inbound active)
//
// Run: cd oms && npx tsx scripts/smoke-p7.mjs

import "dotenv/config";
import { MongoClient } from "mongodb";
import bcrypt from "bcrypt";

process.on("unhandledRejection", (r) => {
  console.error("UNHANDLED REJECTION:", r);
  process.exit(2);
});
process.on("uncaughtException", (e) => {
  console.error("UNCAUGHT:", e);
  process.exit(2);
});

const URI =
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true";
const DB_NAME = process.env.MONGODB_NAME || "vw_sms";

const SEED_EMAIL = "p7smoke@example.com";
const SEED_PWD = "P7Smoke!2026";

async function main() {
  console.log("== smoke-p7 boot ==");
  const mc = new MongoClient(URI);
  await mc.connect();
  const db = mc.db(DB_NAME);

  // ── 0) Clean previous run ─────────────────────────────────
  const prev = await db.collection("clients").findOne({ email: SEED_EMAIL });
  if (prev) {
    const cid = String(prev._id);
    await db.collection("outbound_requests").deleteMany({ client_id: cid });
    await db.collection("outbound_inbound_links").deleteMany({ client_id: cid });
    await db.collection("outbound_action_logs").deleteMany({ client_id: cid });
    await db.collection("rate_quote_logs").deleteMany({ client_id: cid });
    await db.collection("inbound_requests").deleteMany({ client_id: cid });
    await db.collection("wallet_transactions").deleteMany({ client_id: cid });
    await db.collection("clients").deleteOne({ _id: prev._id });
  }
  await db
    .collection("inbound_requests")
    .deleteMany({ _id: { $in: ["I-20260511-9001", "I-20260511-9002"] } });

  // ── 1) Create a verified client ────────────────────────────
  const pwdHash = await bcrypt.hash(SEED_PWD, 10);
  const now = new Date();
  const cIns = await db.collection("clients").insertOne({
    email: SEED_EMAIL,
    password_hash: pwdHash,
    company_name: "P7 Smoke Co",
    contact_name: "Test Marco",
    country: "HK",
    phone: "+852-99990000",
    email_verified: true,
    email_verified_at: now,
    status: "active",
    onboarding_completed: true,
    balance: 0,
    createdAt: now,
    updatedAt: now,
  });
  const client_id = String(cIns.insertedId);
  console.log("✓ client created:", client_id);

  // ── 2) Create 2 received inbounds ───────────────────────
  const warehouse = await db
    .collection("warehouses")
    .findOne({ status: "active" });
  const carrier_inbound = await db
    .collection("carriers_inbound")
    .findOne({ status: "active" });
  if (!warehouse || !carrier_inbound) {
    throw new Error("missing master data — run P4 seed first");
  }
  const inb1 = "I-20260511-9001";
  const inb2 = "I-20260511-9002";
  await db.collection("inbound_requests").insertMany([
    {
      _id: inb1,
      client_id,
      warehouseCode: warehouse.warehouseCode,
      carrier_inbound_code: carrier_inbound.carrier_inbound_code,
      tracking_no: "TST001",
      tracking_no_normalized: "TST001",
      inbound_source: "regular",
      size_estimate: "small",
      contains_liquid: false,
      contains_battery: false,
      shipment_type: "consolidated",
      declared_value_total: 100,
      declared_currency: "JPY",
      declared_items_count: 1,
      status: "received",
      receivedAt: now,
      actualWeight: 1.5,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: inb2,
      client_id,
      warehouseCode: warehouse.warehouseCode,
      carrier_inbound_code: carrier_inbound.carrier_inbound_code,
      tracking_no: "TST002",
      tracking_no_normalized: "TST002",
      inbound_source: "regular",
      size_estimate: "small",
      contains_liquid: false,
      contains_battery: false,
      shipment_type: "consolidated",
      declared_value_total: 50,
      declared_currency: "JPY",
      declared_items_count: 1,
      status: "received",
      receivedAt: now,
      actualWeight: 2,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  console.log("✓ inbounds created (received state)");

  // ── 3) Rate quote preview ────────────────────────────────
  const { rateQuoteWithLog } = await import(
    "../src/services/carrier/carrierAdapter.ts"
  );
  const q = await rateQuoteWithLog({
    outbound_id: null,
    client_id,
    carrier_code: "yunexpress",
    destination_country: "HK",
    weight_kg: 3.5,
  });
  console.log("✓ rate quote:", q.total, "HKD");

  // ── 4) Create outbound with 0 balance → held ─────────────
  const { createConsolidatedOutbound } = await import(
    "../src/services/outbound/outbound-service.ts"
  );
  const heldDoc = await createConsolidatedOutbound(
    { client_id },
    {
      inbound_ids: [inb1, inb2],
      carrier_code: "yunexpress",
      carrier_account_id: null,
      receiver_address: {
        name: "陳大文",
        phone: "+852-99990001",
        country_code: "HK",
        city: "中環",
        address: "中環中路 1 號",
      },
      processing_preference: "auto",
    }
  );
  if (heldDoc.status !== "held" || heldDoc.held_reason !== "insufficient_balance") {
    throw new Error(
      `expected held(insufficient_balance), got ${heldDoc.status}/${heldDoc.held_reason}`
    );
  }
  console.log(
    `✓ outbound held (insufficient_balance): ${heldDoc._id} need=${heldDoc.quoted_amount_hkd}`
  );

  // ── 5) Top-up balance → auto release ─────────────────────
  const { walletService } = await import(
    "../src/services/wallet/walletService.ts"
  );
  await walletService.topup({
    client_id,
    amount: 5000,
    reference_type: "manual",
    gateway: "manual",
    operator_staff_id: "smoke-admin",
  });
  const { releaseHeldByBalance } = await import(
    "../src/services/outbound/outbound-service.ts"
  );
  const rel = await releaseHeldByBalance(client_id);
  const after = await db
    .collection("outbound_requests")
    .findOne({ _id: heldDoc._id });
  if (after.status !== "ready_for_label") {
    throw new Error(`expected ready_for_label after release, got ${after.status}`);
  }
  console.log("✓ topup → released, status=ready_for_label, released_count=", rel.released);

  // ── 6) Inbound link guard ────────────────────────────────
  let dupErr = null;
  try {
    await createConsolidatedOutbound(
      { client_id },
      {
        inbound_ids: [inb1],
        carrier_code: "yunexpress",
        carrier_account_id: null,
        receiver_address: {
          name: "x",
          phone: "1",
          country_code: "HK",
          city: "x",
          address: "x",
        },
        processing_preference: "auto",
      }
    );
  } catch (e) {
    dupErr = e;
  }
  if (!dupErr || dupErr.name !== "INBOUND_ALREADY_IN_ACTIVE_OUTBOUND") {
    throw new Error(
      `expected INBOUND_ALREADY_IN_ACTIVE_OUTBOUND, got ${dupErr?.name ?? "no error"}`
    );
  }
  console.log("✓ duplicate inbound link rejected");

  // ── 7) Cancel + freed link ───────────────────────────────
  const { cancelMyOutbound } = await import(
    "../src/services/outbound/outbound-service.ts"
  );
  const cancelled = await cancelMyOutbound(
    { client_id },
    heldDoc._id,
    { cancel_reason: "smoke cleanup" }
  );
  if (cancelled.status !== "cancelled") {
    throw new Error(`expected cancelled, got ${cancelled.status}`);
  }
  console.log("✓ outbound cancelled");

  // ── 8) Re-use freed inbound with confirm_before_label ───
  const ob2 = await createConsolidatedOutbound(
    { client_id },
    {
      inbound_ids: [inb1],
      carrier_code: "yunexpress",
      carrier_account_id: null,
      receiver_address: {
        name: "陳大文",
        phone: "+852-99990001",
        country_code: "TW",
        city: "台北",
        address: "信義路 100",
      },
      processing_preference: "confirm_before_label",
    }
  );
  // Per P8 alignment: confirm_before_label preference is honored at the
  // post-weigh checkpoint, not at create time. So both auto and
  // confirm_before_label start in ready_for_label.
  if (ob2.status !== "ready_for_label") {
    throw new Error(`expected ready_for_label, got ${ob2.status}`);
  }
  console.log("✓ freed inbound reused → ready_for_label:", ob2._id);

  // ── 9) Capacity violation ────────────────────────────────
  let capErr = null;
  try {
    await rateQuoteWithLog({
      outbound_id: null,
      client_id,
      carrier_code: "yunexpress",
      destination_country: "HK",
      weight_kg: 40,
    });
  } catch (e) {
    capErr = e;
  }
  if (!capErr || capErr.name !== "CAPACITY_VIOLATION") {
    throw new Error(`expected CAPACITY_VIOLATION, got ${capErr?.name}`);
  }
  console.log("✓ capacity violation rejected (40kg > 30kg)");

  // ── 10) Mock label PDF (P7 single-box fast path) ────────
  const { fetchLabel } = await import(
    "../src/services/outbound/outbound-service.ts"
  );
  // P7 fetchLabel still works for outbounds that skipped P8 reweigh
  // (e.g. mock dev fast path). It expects ready_for_label.
  const labelResult = await fetchLabel({ outbound_id: ob2._id });
  console.log(
    `✓ label generated: tracking_no=${labelResult.tracking_no} charged=${labelResult.charged} url=${labelResult.label_url}`
  );

  // ── Summary ─────────────────────────────────────────────
  const c = {
    outbounds: await db.collection("outbound_requests").countDocuments({ client_id }),
    links: await db.collection("outbound_inbound_links").countDocuments({ client_id }),
    action_logs: await db.collection("outbound_action_logs").countDocuments({ client_id }),
    rate_quote_logs: await db.collection("rate_quote_logs").countDocuments({ client_id }),
    wallet_tx: await db.collection("wallet_transactions").countDocuments({ client_id }),
  };
  console.log("\n=== P7 counts ===");
  console.log(c);

  await mc.close();
  console.log("\n✅ P7 smoke passed");
}

main().catch(async (e) => {
  console.error("❌ smoke failed:", e?.message ?? e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});

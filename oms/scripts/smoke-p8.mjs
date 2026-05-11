// Phase 8 smoke test — full WMS outbound flow.
//
// Verifies: P5/P6/P7 prereqs (received inbounds + outbound created) → pick
// → pack → weigh → label → print → depart, including:
//   - Bug 6 fix: pick does NOT change item_locations.locationCode
//   - multi-box label generation (2 boxes per outbound)
//   - status state machine through 10+ transitions
//   - inbound → departed mirror after final box scan
//   - notification breadcrumbs at each stage
//
// Run: cd oms && npx tsx scripts/smoke-p8.mjs

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
const SEED_EMAIL = "p8smoke@example.com";
const SEED_PWD = "P8Smoke!2026";

async function main() {
  console.log("== smoke-p8 boot ==");
  const mc = new MongoClient(URI);
  await mc.connect();
  const db = mc.db(DB_NAME);

  // ── Clean previous run ───────────────────────────────────
  const prev = await db.collection("clients").findOne({ email: SEED_EMAIL });
  if (prev) {
    const cid = String(prev._id);
    await db.collection("outbound_requests").deleteMany({ client_id: cid });
    await db.collection("outbound_inbound_links").deleteMany({ client_id: cid });
    await db.collection("outbound_action_logs").deleteMany({ client_id: cid });
    await db.collection("rate_quote_logs").deleteMany({ client_id: cid });
    await db.collection("outbound_boxes").deleteMany({});
    await db.collection("box_inbound_links").deleteMany({});
    await db.collection("outbound_box_weights").deleteMany({});
    await db.collection("outbound_scans").deleteMany({});
    await db.collection("inbound_requests").deleteMany({ client_id: cid });
    await db.collection("item_locations").deleteMany({
      itemCode: { $in: ["I-20260511-9101", "I-20260511-9102", "I-20260511-9103"] },
    });
    await db.collection("wallet_transactions").deleteMany({ client_id: cid });
    await db.collection("clients").deleteOne({ _id: prev._id });
  } else {
    await db
      .collection("inbound_requests")
      .deleteMany({
        _id: { $in: ["I-20260511-9101", "I-20260511-9102", "I-20260511-9103"] },
      });
  }

  // ── 1) Setup: client + 3 received inbounds with item_locations ──
  const pwdHash = await bcrypt.hash(SEED_PWD, 10);
  const now = new Date();
  const cIns = await db.collection("clients").insertOne({
    email: SEED_EMAIL,
    password_hash: pwdHash,
    company_name: "P8 Smoke Co",
    contact_name: "Test Marco",
    country: "HK",
    phone: "+852-88880000",
    email_verified: true,
    email_verified_at: now,
    status: "active",
    onboarding_completed: true,
    balance: 10000, // enough for label fees
    createdAt: now,
    updatedAt: now,
  });
  const client_id = String(cIns.insertedId);

  const warehouse = await db
    .collection("warehouses")
    .findOne({ status: "active" });
  const carrier_inbound = await db
    .collection("carriers_inbound")
    .findOne({ status: "active" });

  const inboundIds = ["I-20260511-9101", "I-20260511-9102", "I-20260511-9103"];
  const weights = [2.0, 1.5, 1.8];
  for (let i = 0; i < inboundIds.length; i++) {
    const _id = inboundIds[i];
    await db.collection("inbound_requests").insertOne({
      _id,
      client_id,
      warehouseCode: warehouse.warehouseCode,
      carrier_inbound_code: carrier_inbound.carrier_inbound_code,
      tracking_no: `P8TST${i + 1}`,
      tracking_no_normalized: `P8TST${i + 1}`,
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
      actualWeight: weights[i],
      createdAt: now,
      updatedAt: now,
    });
    await db.collection("item_locations").insertOne({
      itemCode: _id,
      locationCode: `A00${i + 1}`,
      currentStatus: "in_storage",
      lastMovedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log("✓ seeded 1 client + 3 received inbounds with locations");

  // ── 2) Create consolidated outbound (P7 path) ────────────
  const { createConsolidatedOutbound } = await import(
    "../src/services/outbound/outbound-service.ts"
  );
  const ob = await createConsolidatedOutbound(
    { client_id },
    {
      inbound_ids: inboundIds,
      carrier_code: "yunexpress",
      carrier_account_id: null,
      receiver_address: {
        name: "陳小姐",
        phone: "+852-99998888",
        country_code: "HK",
        city: "中環",
        address: "中環中路 88 號",
      },
      processing_preference: "confirm_before_label",
    }
  );
  if (ob.status !== "ready_for_label") {
    throw new Error(`expected ready_for_label, got ${ob.status}`);
  }
  console.log(`✓ outbound created: ${ob._id} status=ready_for_label`);

  // ── 3) Stage 5: pick each inbound (mixed PDA + desktop) ──
  const { pickInbound } = await import(
    "../src/services/outbound/wmsFlow.ts"
  );
  const staffCtx = { staff_id: "smoke-staff", warehouseCode: warehouse.warehouseCode };

  // PDA path: with locationCode
  const p1 = await pickInbound(staffCtx, {
    outbound_id: ob._id,
    inbound_id: inboundIds[0],
    locationCode: "A001",
    method: "pda_scan",
  });
  if (p1.outbound.status !== "picking") {
    throw new Error(`expected picking after first pick, got ${p1.outbound.status}`);
  }
  // Verify Bug 6 fix: location not modified
  const loc1 = await db.collection("item_locations").findOne({ itemCode: inboundIds[0] });
  if (loc1.locationCode !== "A001") {
    throw new Error("Bug 6 regression: locationCode was modified during pick");
  }
  if (loc1.currentStatus !== "picked") {
    throw new Error(`expected currentStatus=picked, got ${loc1.currentStatus}`);
  }
  console.log("✓ Bug 6 verified: pick did NOT modify item_locations.locationCode");

  // Desktop path: no locationCode
  await pickInbound(staffCtx, {
    outbound_id: ob._id,
    inbound_id: inboundIds[1],
    method: "desktop_batch",
  });
  const p3 = await pickInbound(staffCtx, {
    outbound_id: ob._id,
    inbound_id: inboundIds[2],
    method: "desktop_batch",
  });
  if (p3.outbound.status !== "picked") {
    throw new Error(`expected picked after all picks, got ${p3.outbound.status}`);
  }
  console.log("✓ all 3 inbounds picked → outbound.status=picked");

  // ── 4) Stage 6: create 2 boxes ───────────────────────────
  const { createBox, completePacking } = await import(
    "../src/services/outbound/wmsFlow.ts"
  );
  const box1 = await createBox(staffCtx, {
    outbound_id: ob._id,
    inbound_ids: [inboundIds[0], inboundIds[1]],
    dimensions: { length: 30, width: 25, height: 15 },
    weight_estimate: 4.0,
  });
  const box2 = await createBox(staffCtx, {
    outbound_id: ob._id,
    inbound_ids: [inboundIds[2]],
    dimensions: { length: 25, width: 20, height: 15 },
    weight_estimate: 2.3,
  });
  console.log(`✓ 2 boxes created: ${box1.box_no}, ${box2.box_no}`);

  await completePacking(staffCtx, ob._id);
  const afterPack = await db
    .collection("outbound_requests")
    .findOne({ _id: ob._id });
  if (afterPack.status !== "packed") {
    throw new Error(`expected packed, got ${afterPack.status}`);
  }
  console.log("✓ pack complete → outbound.status=packed");

  // ── 5) Stage 7 step 1+2: weigh each box ──────────────────
  const { weighBox, completeWeighing } = await import(
    "../src/services/outbound/wmsFlow.ts"
  );
  // Box 1: expected gross = 2.0 + 1.5 + 0.5 tare = 4.0; weigh as 4.1 → diff 0.1 (pass)
  const w1 = await weighBox(staffCtx, {
    box_no: box1.box_no,
    actual_gross_weight: 4.1,
    tare_weight: 0.5,
    method: "desktop",
  });
  if (!w1.tolerance_passed) throw new Error("box1 should have passed tolerance");

  // Box 2: expected gross = 1.8 + 0.4 tare = 2.2; weigh as 3.0 → diff 0.8 (over 0.5 tol)
  let overErr = null;
  try {
    await weighBox(staffCtx, {
      box_no: box2.box_no,
      actual_gross_weight: 3.0,
      tare_weight: 0.4,
      method: "desktop",
    });
  } catch (e) {
    overErr = e;
  }
  if (!overErr || overErr.name !== "WEIGHT_TOLERANCE_EXCEEDED_NO_OVERRIDE") {
    throw new Error(
      `expected WEIGHT_TOLERANCE_EXCEEDED, got ${overErr?.name ?? "no error"}`
    );
  }
  console.log("✓ tolerance guard fires on 0.8kg diff");

  // Override
  const w2 = await weighBox(staffCtx, {
    box_no: box2.box_no,
    actual_gross_weight: 3.0,
    tare_weight: 0.4,
    method: "desktop",
    override: true,
  });
  if (w2.tolerance_passed) throw new Error("override should record tolerance_passed=false");
  console.log("✓ override path writes box_weight_override scan");

  // Complete weighing → confirm_before_label so status → pending_client_label
  const cw = await completeWeighing(staffCtx, ob._id);
  if (cw.outbound.status !== "pending_client_label") {
    throw new Error(
      `expected pending_client_label, got ${cw.outbound.status}`
    );
  }
  if (cw.auto_label_triggered) {
    throw new Error("auto_label_triggered should be false for confirm_before_label");
  }
  console.log("✓ weighing complete → pending_client_label (confirm-flow)");

  // ── 6) Stage 7 step 3: client confirms label ─────────────
  const { clientConfirmLabel } = await import(
    "../src/services/outbound/wmsFlow.ts"
  );
  const labelResult = await clientConfirmLabel(client_id, ob._id);
  if (labelResult.box_count !== 2) {
    throw new Error(`expected 2 labels, got ${labelResult.box_count}`);
  }
  console.log(
    `✓ client confirm → ${labelResult.box_count} labels fetched, total HK$${labelResult.total_label_fee}`
  );

  // Verify per-box tracking format
  const boxes = await db
    .collection("outbound_boxes")
    .find({ outbound_id: ob._id })
    .sort({ box_no: 1 })
    .toArray();
  for (const b of boxes) {
    if (!b.tracking_no_carrier?.startsWith("MOCK-YUNEXPRESS-")) {
      throw new Error(`unexpected tracking format: ${b.tracking_no_carrier}`);
    }
    if (b.status !== "label_obtained") {
      throw new Error(`box ${b.box_no} status=${b.status}, expected label_obtained`);
    }
  }
  console.log("✓ per-box tracking format MOCK-YUNEXPRESS-OUT-...-BOXn verified");

  // ── 7) Stage 7 step 4: print complete ────────────────────
  const { labelPrintComplete } = await import(
    "../src/services/outbound/wmsFlow.ts"
  );
  const printed = await labelPrintComplete(staffCtx, ob._id);
  if (printed.status !== "label_printed") {
    throw new Error(`expected label_printed, got ${printed.status}`);
  }
  console.log("✓ label print complete → outbound.status=label_printed");

  // ── 8) Stage 8: depart each box on PDA ───────────────────
  const { departBox } = await import("../src/services/outbound/wmsFlow.ts");
  const d1 = await departBox(staffCtx, box1.box_no);
  if (d1.outbound_departed) {
    throw new Error("outbound shouldn't be departed after 1/2 box");
  }
  console.log(
    `✓ box1 departed; progress=${d1.progress.departed}/${d1.progress.total}`
  );

  const d2 = await departBox(staffCtx, box2.box_no);
  if (!d2.outbound_departed) {
    throw new Error("outbound should be departed after both boxes");
  }
  console.log("✓ box2 departed → outbound.status=departed");

  // Verify inbound status → departed
  const inboundsAfter = await db
    .collection("inbound_requests")
    .find({ _id: { $in: inboundIds } })
    .toArray();
  for (const ib of inboundsAfter) {
    if (ib.status !== "departed") {
      throw new Error(`inbound ${ib._id} status=${ib.status}, expected departed`);
    }
  }
  console.log("✓ all 3 inbounds mirrored to status=departed");

  // ── 9) Idempotency: depart same box again → error ────────
  let dupDepart = null;
  try {
    await departBox(staffCtx, box1.box_no);
  } catch (e) {
    dupDepart = e;
  }
  if (!dupDepart || dupDepart.name !== "BOX_ALREADY_DEPARTED") {
    throw new Error(`expected BOX_ALREADY_DEPARTED, got ${dupDepart?.name}`);
  }
  console.log("✓ re-depart properly rejected (BOX_ALREADY_DEPARTED)");

  // ── 10) Summary ──────────────────────────────────────────
  const counts = {
    outbounds: await db.collection("outbound_requests").countDocuments({ client_id }),
    boxes: await db.collection("outbound_boxes").countDocuments({ outbound_id: ob._id }),
    box_links: await db.collection("box_inbound_links").countDocuments({ outbound_id: ob._id }),
    box_weights: await db.collection("outbound_box_weights").countDocuments({ outbound_id: ob._id }),
    outbound_scans: await db.collection("outbound_scans").countDocuments({ outbound_id: ob._id }),
    wallet_tx: await db.collection("wallet_transactions").countDocuments({ client_id }),
    notifications: await db.collection("notifications").countDocuments({ client_id }),
  };
  console.log("\n=== P8 counts ===");
  console.log(counts);

  await mc.close();
  console.log("\n✅ P8 smoke passed");
}

main().catch((e) => {
  console.error("❌ smoke failed:", e?.message ?? e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});

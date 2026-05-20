// Comprehensive demo seed for the v2 OMS overview page.
//
// Seeds wms-test-a@example.com with enough docs to exercise all 6 pipeline
// stages once the user logs in:
//
//   Stage 1 (waiting_inbound)     — 4 pending + 1 arrived inbound
//   Stage 2 (shelved managed)     — 2 consolidation_groups with received inbounds
//   Stage 2 (shelved manual)      — 2 received inbounds (manual_consolidate, no outbound)
//   Stage 3 (waiting_consolidate) — 1 outbound at status=ready_for_label
//   Stage 4 (consolidated)        — 1 outbound at weight_verified + 2 boxes
//   Stage 5 (waiting_dispatch)    — 1 outbound at label_printed + 2 boxes
//   Stage 6 (dispatched)          — 1 outbound at departed (last 7 days) + boxes
//
// Wipes prior demo docs tagged via `demo_tag = "overview-v2"` before reseeding,
// so the script is idempotent.
//
// Run from oms/: npx tsx scripts/seeds/demo-shipments-overview.mjs

import "dotenv/config";
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI || "mongodb://localhost:27017/?replicaSet=rs0";
const DB = process.env.MONGODB_DB || "vw_sms";

const CLIENT_EMAIL = "wms-test-a@example.com";
const WAREHOUSE_CODE = "JP-SAITAMA-01";
const DEMO_TAG = "overview-v2";
const NOW = new Date();
const recent = (daysAgo, hour = 14, min = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d;
};

const RECEIVER_HK = {
  name: "陳大文",
  phone: "+852-9100-1111",
  country_code: "HK",
  city: "Kwun Tong",
  district: "Kowloon",
  address: "Demo Tower 8/F Unit B",
  postal_code: "",
};
const RECEIVER_TW = {
  name: "林志明",
  phone: "+886-2-2700-2222",
  country_code: "TW",
  city: "台北市",
  district: "信義區",
  address: "市府路 1 號 12F-3",
  postal_code: "11049",
};

async function main() {
  const c = new MongoClient(URI);
  await c.connect();
  const db = c.db(DB);

  // 0. ensure client + warehouse exist
  const client = await db
    .collection("clients")
    .findOne({ email: CLIENT_EMAIL });
  if (!client) {
    console.error(
      `✗ Client ${CLIENT_EMAIL} not found — run scripts/seeds/demo-0518-wms-presentation.mjs first to provision base clients.`
    );
    await c.close();
    process.exit(1);
  }
  const clientId = String(client._id);
  console.log(`→ Seeding overview demo data for client ${clientId} (${CLIENT_EMAIL})`);

  // 1. wipe prior overview demo docs
  console.log(`→ Wiping prior demo_tag=${DEMO_TAG} docs`);
  await Promise.all([
    db.collection("inbound_requests").deleteMany({ client_id: clientId, demo_tag: DEMO_TAG }),
    db.collection("inbound_declared_items").deleteMany({ client_id: clientId, demo_tag: DEMO_TAG }),
    db.collection("consolidation_groups").deleteMany({ client_id: clientId, demo_tag: DEMO_TAG }),
    db.collection("outbound_requests").deleteMany({ client_id: clientId, demo_tag: DEMO_TAG }),
    db.collection("outbound_inbound_links").deleteMany({ demo_tag: DEMO_TAG }),
    db.collection("outbound_boxes").deleteMany({ demo_tag: DEMO_TAG }),
    db.collection("box_inbound_links").deleteMany({ demo_tag: DEMO_TAG }),
  ]);

  // 2. ensure a saved_address + carrier_account exist for this client
  let address = await db
    .collection("saved_addresses")
    .findOne({ client_id: clientId });
  if (!address) {
    const addrId = `ADDR-${clientId.slice(-6)}-001`;
    address = {
      _id: addrId,
      client_id: clientId,
      recipient_name: RECEIVER_HK.name,
      city: RECEIVER_HK.city,
      country_code: RECEIVER_HK.country_code,
      address: RECEIVER_HK.address,
      district: RECEIVER_HK.district,
      phone: RECEIVER_HK.phone,
      postal_code: RECEIVER_HK.postal_code,
      receiver_address_snapshot: RECEIVER_HK,
      is_default: true,
      deleted_at: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.collection("saved_addresses").insertOne(address);
    console.log(`  ✓ inserted default saved_address ${addrId}`);
  }

  let carrierAccount = await db
    .collection("client_carrier_accounts")
    .findOne({ client_id: clientId });
  if (!carrierAccount) {
    const accId = `CARR-${clientId.slice(-6)}-001`;
    carrierAccount = {
      _id: accId,
      client_id: clientId,
      carrier_code: "sf_express",
      account_no: "acc_021",
      default_service_code: "STANDARD",
      status: "active",
      deleted_at: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.collection("client_carrier_accounts").insertOne(carrierAccount);
    console.log(`  ✓ inserted default carrier_account ${accId}`);
  }

  // Ensure the carrier itself exists so overview-service can resolve display name
  await db.collection("carriers").updateOne(
    { carrier_code: "sf_express" },
    {
      $setOnInsert: {
        carrier_code: "sf_express",
        display_name: "SF Express",
        display_name_zh_hk: "順豐速運",
        display_name_zh_cn: "顺丰速运",
        status: "active",
        createdAt: NOW,
      },
    },
    { upsert: true }
  );

  // Shared shipping_destination payload for managed_consign + outbound
  const shippingDestination = {
    saved_address_id: address._id,
    receiver_address_snapshot: address.receiver_address_snapshot ?? RECEIVER_HK,
    carrier_account_id: carrierAccount._id,
  };

  // 3. helper to build an inbound doc
  let inboundCounter = 1;
  const nextInboundId = () =>
    `I-OV-${String(inboundCounter++).padStart(4, "0")}`;

  function buildInbound(opts) {
    const _id = nextInboundId();
    return {
      _id,
      client_id: clientId,
      warehouseCode: WAREHOUSE_CODE,
      carrier_inbound_code: "yamato",
      tracking_no: `JP${Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000}`,
      tracking_no_normalized: null,
      tracking_no_other: null,
      inbound_source: "regular",
      size_estimate: "medium",
      size_estimate_note: null,
      contains_liquid: false,
      contains_battery: false,
      shipping_mode: opts.shipping_mode ?? "managed_consign",
      shipping_destination: opts.shipping_destination ?? shippingDestination,
      consolidation_group_id: opts.consolidation_group_id ?? null,
      customer_remarks: null,
      declared_value_total: opts.declared_value_total ?? 4800,
      declared_currency: "JPY",
      declared_items_count: 1,
      status: opts.status,
      cancelled_at: null,
      cancel_reason: null,
      abandoned_at: null,
      abandoned_reason: null,
      arrivedAt: opts.arrivedAt ?? null,
      receivedAt: opts.receivedAt ?? null,
      actualWeight: null,
      actualDimension: null,
      createdAt: opts.createdAt ?? NOW,
      updatedAt: NOW,
      demo_tag: DEMO_TAG,
    };
  }

  function declaredItemFor(inboundId, name, quantity, unit_price) {
    return {
      inbound_request_id: inboundId,
      client_id: clientId,
      category_id: "cat_01",
      subcategory_id: "cat_01_sub01",
      product_name: name,
      product_url: null,
      quantity,
      unit_price,
      currency: "JPY",
      subtotal: quantity * unit_price,
      display_order: 0,
      createdAt: NOW,
      updatedAt: NOW,
      demo_tag: DEMO_TAG,
    };
  }

  // ── Stage 1: 4 pending + 1 arrived ──────────────────────────
  const s1Inbounds = [
    buildInbound({ status: "pending", createdAt: recent(0, 9, 30) }),
    buildInbound({ status: "pending", createdAt: recent(0, 14, 22), shipping_mode: "single_direct" }),
    buildInbound({ status: "pending", createdAt: recent(1, 18, 45), shipping_mode: "manual_consolidate" }),
    buildInbound({ status: "pending", createdAt: recent(2, 22, 10) }),
    buildInbound({
      status: "arrived",
      arrivedAt: recent(0, 10, 0),
      createdAt: recent(2, 9, 5),
    }),
  ];
  await db.collection("inbound_requests").insertMany(s1Inbounds);
  await db.collection("inbound_declared_items").insertMany([
    declaredItemFor(s1Inbounds[0]._id, "無線耳機", 2, 2400),
    declaredItemFor(s1Inbounds[1]._id, "服飾", 3, 3200),
    declaredItemFor(s1Inbounds[2]._id, "書籍", 6, 1000),
    declaredItemFor(s1Inbounds[3]._id, "相機配件", 1, 4800),
    declaredItemFor(s1Inbounds[4]._id, "美妝", 4, 3000),
  ]);
  console.log(`  ✓ Stage 1: ${s1Inbounds.length} inbounds`);

  // ── Stage 2 (managed): consolidation_group with received inbounds ──
  const groupAId = `CG-OV-${String(inboundCounter++).padStart(4, "0")}`;
  const groupBId = `CG-OV-${String(inboundCounter++).padStart(4, "0")}`;

  const groupAInbounds = [0, 1, 2].map(() =>
    buildInbound({
      status: "received",
      receivedAt: recent(3, 14, 22),
      consolidation_group_id: groupAId,
    })
  );
  // Make groupA fully arrived (all 3 shelved)
  await db.collection("inbound_requests").insertMany(groupAInbounds);
  await db.collection("inbound_declared_items").insertMany(
    groupAInbounds.map((ib, i) =>
      declaredItemFor(ib._id, ["相機配件", "服飾", "無線耳機"][i], i + 1, 3200)
    )
  );

  const groupBInbounds = [
    buildInbound({
      status: "received",
      receivedAt: recent(1, 10, 5),
      consolidation_group_id: groupBId,
    }),
    buildInbound({
      status: "received",
      receivedAt: recent(1, 11, 20),
      consolidation_group_id: groupBId,
    }),
    // 2 still not arrived (status=pending) but listed in group forecast
    buildInbound({
      status: "pending",
      consolidation_group_id: groupBId,
    }),
    buildInbound({
      status: "pending",
      consolidation_group_id: groupBId,
    }),
  ];
  await db.collection("inbound_requests").insertMany(groupBInbounds);
  await db.collection("inbound_declared_items").insertMany(
    groupBInbounds.map((ib, i) =>
      declaredItemFor(ib._id, ["美妝", "電動牙刷", "連身裙", "保健品"][i], i + 1, 3100)
    )
  );

  await db.collection("consolidation_groups").insertMany([
    {
      _id: groupAId,
      client_id: clientId,
      warehouseCode: WAREHOUSE_CODE,
      saved_address_id: address._id,
      carrier_account_id: carrierAccount._id,
      status: "pending",
      oldest_received_at: recent(3, 14, 22),
      forecast_ids: groupAInbounds.map((ib) => ib._id),
      swept_at: null,
      swept_outbound_id: null,
      createdAt: recent(3, 14, 22),
      updatedAt: NOW,
      demo_tag: DEMO_TAG,
    },
    {
      _id: groupBId,
      client_id: clientId,
      warehouseCode: WAREHOUSE_CODE,
      saved_address_id: address._id,
      carrier_account_id: carrierAccount._id,
      status: "pending",
      oldest_received_at: recent(1, 10, 5),
      forecast_ids: groupBInbounds.map((ib) => ib._id),
      swept_at: null,
      swept_outbound_id: null,
      createdAt: recent(1, 10, 5),
      updatedAt: NOW,
      demo_tag: DEMO_TAG,
    },
  ]);
  console.log(
    `  ✓ Stage 2 (managed): 2 consolidation_groups (${groupAInbounds.length + groupBInbounds.length} inbounds)`
  );

  // ── Stage 2 (manual pending): received + manual mode, no outbound ──
  const s2ManualInbounds = [
    buildInbound({
      status: "received",
      receivedAt: recent(1, 9, 50),
      shipping_mode: "manual_consolidate",
    }),
    buildInbound({
      status: "received",
      receivedAt: recent(1, 10, 14),
      shipping_mode: "manual_consolidate",
    }),
  ];
  await db.collection("inbound_requests").insertMany(s2ManualInbounds);
  await db.collection("inbound_declared_items").insertMany([
    declaredItemFor(s2ManualInbounds[0]._id, "電子產品", 2, 4200),
    declaredItemFor(s2ManualInbounds[1]._id, "書籍", 6, 1000),
  ]);
  console.log(`  ✓ Stage 2 (manual): ${s2ManualInbounds.length} inbounds`);

  // ── Stage 3-6: outbounds with various statuses ──────────────
  // For each stage, build 1 outbound + relevant inbound link table rows + boxes

  let outboundCounter = 1;
  const nextOutboundId = () =>
    `O-OV-${String(outboundCounter++).padStart(4, "0")}`;

  function buildOutbound(opts) {
    const _id = nextOutboundId();
    return {
      _id,
      client_id: clientId,
      warehouseCode: WAREHOUSE_CODE,
      shipment_type: opts.shipment_type ?? "consolidated",
      inbound_count: opts.inbound_count ?? 1,
      carrier_code: "sf_express",
      carrier_account_id: carrierAccount._id,
      service_code: "STANDARD",
      destination_country: "HK",
      receiver_address: RECEIVER_HK,
      processing_preference: "confirm_before_label",
      status: opts.status,
      held_reason: null,
      held_since: null,
      held_detail: null,
      declared_weight_kg: 2.5,
      actual_weight_kg: opts.actual_weight_kg ?? null,
      actual_dimension: null,
      rate_quote: null,
      quoted_amount_hkd: opts.quoted_amount_hkd ?? 188,
      label_url: opts.label_url ?? null,
      label_obtained_at: opts.label_obtained_at ?? null,
      tracking_no: opts.tracking_no ?? null,
      departed_at: opts.departed_at ?? null,
      cancelled_at: null,
      cancel_reason: null,
      customer_remarks: null,
      batch_id: null,
      disallow_consolidation: false,
      cargo_categories: [],
      label_batch_id: null,
      createdAt: opts.createdAt ?? NOW,
      updatedAt: NOW,
      demo_tag: DEMO_TAG,
    };
  }

  // Stage 3: outbound at ready_for_label + 3 inbounds inside
  const stage3InboundDocs = [0, 1, 2].map(() =>
    buildInbound({
      status: "received",
      receivedAt: recent(2, 14, 20),
    })
  );
  await db.collection("inbound_requests").insertMany(stage3InboundDocs);
  await db.collection("inbound_declared_items").insertMany(
    stage3InboundDocs.map((ib, i) =>
      declaredItemFor(ib._id, ["相機配件", "服飾", "無線耳機"][i], i + 1, 3200)
    )
  );
  const stage3Outbound = buildOutbound({
    status: "ready_for_label",
    inbound_count: 3,
    createdAt: recent(1, 18, 0),
  });
  await db.collection("outbound_requests").insertOne(stage3Outbound);
  await db.collection("outbound_inbound_links").insertMany(
    stage3InboundDocs.map((ib) => ({
      outbound_id: stage3Outbound._id,
      inbound_request_id: ib._id,
      createdAt: NOW,
      demo_tag: DEMO_TAG,
    }))
  );
  console.log(`  ✓ Stage 3: 1 outbound (${stage3Outbound._id}, ready_for_label)`);

  // Stage 4: outbound at weight_verified + 2 boxes
  const stage4InboundDocs = [0, 1].map(() =>
    buildInbound({
      status: "packed",
      receivedAt: recent(4, 14, 0),
    })
  );
  await db.collection("inbound_requests").insertMany(stage4InboundDocs);
  await db.collection("inbound_declared_items").insertMany(
    stage4InboundDocs.map((ib, i) =>
      declaredItemFor(ib._id, ["相機配件", "服飾"][i], i + 1, 4800)
    )
  );
  const stage4Outbound = buildOutbound({
    status: "weight_verified",
    inbound_count: 2,
    actual_weight_kg: 2.6,
    createdAt: recent(3, 16, 0),
  });
  await db.collection("outbound_requests").insertOne(stage4Outbound);
  await db.collection("outbound_inbound_links").insertMany(
    stage4InboundDocs.map((ib) => ({
      outbound_id: stage4Outbound._id,
      inbound_request_id: ib._id,
      createdAt: NOW,
      demo_tag: DEMO_TAG,
    }))
  );
  const stage4Boxes = [
    {
      _id: `BX-OV-${outboundCounter}-1`,
      outbound_id: stage4Outbound._id,
      box_no: "BX-001",
      dimensions: { length: 35, width: 25, height: 20 },
      weight_actual: 2.1,
      status: "weighed",
      createdAt: NOW,
      updatedAt: NOW,
      demo_tag: DEMO_TAG,
    },
    {
      _id: `BX-OV-${outboundCounter}-2`,
      outbound_id: stage4Outbound._id,
      box_no: "BX-002",
      dimensions: { length: 20, width: 15, height: 10 },
      weight_actual: 0.5,
      status: "weighed",
      createdAt: NOW,
      updatedAt: NOW,
      demo_tag: DEMO_TAG,
    },
  ];
  await db.collection("outbound_boxes").insertMany(stage4Boxes);
  await db.collection("box_inbound_links").insertMany([
    {
      box_id: stage4Boxes[0]._id,
      inbound_request_id: stage4InboundDocs[0]._id,
      demo_tag: DEMO_TAG,
    },
    {
      box_id: stage4Boxes[1]._id,
      inbound_request_id: stage4InboundDocs[1]._id,
      demo_tag: DEMO_TAG,
    },
  ]);
  console.log(`  ✓ Stage 4: 1 outbound (${stage4Outbound._id}, weight_verified, 2 boxes)`);

  // Stage 5: outbound at label_printed + 2 boxes
  const stage5InboundDocs = [0, 1].map(() =>
    buildInbound({
      status: "packed",
      receivedAt: recent(5, 11, 0),
    })
  );
  await db.collection("inbound_requests").insertMany(stage5InboundDocs);
  await db.collection("inbound_declared_items").insertMany(
    stage5InboundDocs.map((ib, i) =>
      declaredItemFor(ib._id, ["保健品", "美妝"][i], i + 1, 4200)
    )
  );
  const stage5Outbound = buildOutbound({
    status: "label_printed",
    inbound_count: 2,
    actual_weight_kg: 2.6,
    label_url: "/demo/labels/stage5.pdf",
    label_obtained_at: recent(0, 8, 30),
    tracking_no: "TR8842016523",
    createdAt: recent(5, 9, 0),
  });
  await db.collection("outbound_requests").insertOne(stage5Outbound);
  await db.collection("outbound_inbound_links").insertMany(
    stage5InboundDocs.map((ib) => ({
      outbound_id: stage5Outbound._id,
      inbound_request_id: ib._id,
      createdAt: NOW,
      demo_tag: DEMO_TAG,
    }))
  );
  const stage5Boxes = [
    {
      _id: `BX-OV-${outboundCounter}-1`,
      outbound_id: stage5Outbound._id,
      box_no: "BX-101",
      dimensions: { length: 35, width: 25, height: 20 },
      weight_actual: 2.1,
      status: "label_obtained",
      tracking_no_carrier: "TR8842016523",
      label_pdf_path: "/demo/labels/box-101.pdf",
      label_obtained_at: recent(0, 8, 30),
      createdAt: NOW,
      updatedAt: NOW,
      demo_tag: DEMO_TAG,
    },
    {
      _id: `BX-OV-${outboundCounter}-2`,
      outbound_id: stage5Outbound._id,
      box_no: "BX-102",
      dimensions: { length: 20, width: 15, height: 10 },
      weight_actual: 0.5,
      status: "label_obtained",
      tracking_no_carrier: "TR8842016524",
      label_pdf_path: "/demo/labels/box-102.pdf",
      label_obtained_at: recent(0, 8, 35),
      createdAt: NOW,
      updatedAt: NOW,
      demo_tag: DEMO_TAG,
    },
  ];
  await db.collection("outbound_boxes").insertMany(stage5Boxes);
  await db.collection("box_inbound_links").insertMany([
    {
      box_id: stage5Boxes[0]._id,
      inbound_request_id: stage5InboundDocs[0]._id,
      demo_tag: DEMO_TAG,
    },
    {
      box_id: stage5Boxes[1]._id,
      inbound_request_id: stage5InboundDocs[1]._id,
      demo_tag: DEMO_TAG,
    },
  ]);
  console.log(`  ✓ Stage 5: 1 outbound (${stage5Outbound._id}, label_printed, 2 boxes)`);

  // Stage 6: 3 outbounds at departed (within last 30 days)
  for (let i = 0; i < 3; i++) {
    const stage6InboundDocs = [0, 1].map(() =>
      buildInbound({
        status: "departed",
        receivedAt: recent(7 + i * 3, 11, 0),
      })
    );
    await db.collection("inbound_requests").insertMany(stage6InboundDocs);
    await db.collection("inbound_declared_items").insertMany(
      stage6InboundDocs.map((ib, j) =>
        declaredItemFor(ib._id, ["美妝", "保健品"][j], 2, 3000 + i * 100)
      )
    );
    const stage6Outbound = buildOutbound({
      status: "departed",
      inbound_count: 2,
      actual_weight_kg: 2.4 + i * 0.1,
      tracking_no: `TR9942${5000 + i}123`,
      label_obtained_at: recent(2 + i * 2, 14, 0),
      departed_at: recent(1 + i * 2, 9, 30),
      quoted_amount_hkd: 188 + i * 24,
      createdAt: recent(5 + i * 2, 10, 0),
    });
    await db.collection("outbound_requests").insertOne(stage6Outbound);
    await db.collection("outbound_inbound_links").insertMany(
      stage6InboundDocs.map((ib) => ({
        outbound_id: stage6Outbound._id,
        inbound_request_id: ib._id,
        createdAt: NOW,
        demo_tag: DEMO_TAG,
      }))
    );
    const boxIds = [`BX-OV-${outboundCounter}-1`];
    await db.collection("outbound_boxes").insertOne({
      _id: boxIds[0],
      outbound_id: stage6Outbound._id,
      box_no: `BX-${200 + i}`,
      dimensions: { length: 30, width: 20, height: 18 },
      weight_actual: 2.4 + i * 0.1,
      status: "departed",
      tracking_no_carrier: stage6Outbound.tracking_no,
      label_obtained_at: recent(2 + i * 2, 14, 0),
      departed_at: recent(1 + i * 2, 9, 30),
      createdAt: NOW,
      updatedAt: NOW,
      demo_tag: DEMO_TAG,
    });
    await db.collection("box_inbound_links").insertMany(
      stage6InboundDocs.map((ib) => ({
        box_id: boxIds[0],
        inbound_request_id: ib._id,
        demo_tag: DEMO_TAG,
      }))
    );
    console.log(
      `  ✓ Stage 6: outbound ${stage6Outbound._id} (departed, ${stage6Outbound.departed_at.toISOString().slice(0, 10)})`
    );
  }

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`Overview demo seed complete for ${CLIENT_EMAIL}`);
  console.log(`Login + visit /zh-hk/shipments to see all 6 stages populated.`);
  console.log(`Re-run idempotent — prior demo_tag=${DEMO_TAG} docs wiped first.`);
  console.log(`══════════════════════════════════════════════════════════\n`);

  await c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

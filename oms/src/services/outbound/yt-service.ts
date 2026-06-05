// P17 — YT (雲途) auto-outbound service.
//
// YT parcels are Japan-warehouse-collected small packages destined for
// the ShipItAsia HK YT hub. They have no OMS forecast and no client
// owner; the system aggregates a singleton daily outbound per warehouse
// and auto-appends each shelved YT inbound to it.
//
// Public API:
//   - getOrCreateTodayYtOutbound(warehouseCode)
//       Returns today's open YT outbound for the warehouse. Lazily
//       creates one if no open row exists (singleton per UTC calendar
//       day). Safe to call repeatedly; uses an upsert pattern guarded
//       by the partial unique index "outbound_yt_warehouse_recent"
//       does NOT enforce singleton — caller-side check + insert is
//       atomic enough for the daily volume.
//
//   - appendYtInbound({ inbound_id, warehouseCode })
//       Links a YT-typed inbound row to today's YT outbound, bumping
//       inbound_count. Idempotent on (outbound_id, inbound_id) thanks
//       to the existing outbound_inbound_links unique index.
//
// Wallet / notifications / OMS visibility:
//   - YT outbounds use SYSTEM_CLIENT_ID as client_id. All client-facing
//     queries already filter by ctx.client_id so SYS-YT rows stay
//     invisible to the OMS portal.
//   - Wallet operations are skipped for is_yt outbounds (the system
//     account pays for fuuffy labels, not the customer wallet).
//
// Mock-phase note: the YT receiver address is hard-coded to a
// ShipItAsia HK hub placeholder. Production cutover replaces this with
// a per-warehouse YT_HUB_ADDRESS config row.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { SYSTEM_CLIENT_ID } from "@/cst/system";
import { connectToDatabase, getMongoClient } from "@/lib/mongo";
import { endOfHkDay, startOfHkDay } from "@/lib/time-hk";
import { resolveCarrierAccount } from "@/services/carrier/resolve-carrier-account";
import { nextDailyId } from "@/services/util/daily-counter";
import type { ReceiverAddress } from "@/types/InboundV1";

export { SYSTEM_CLIENT_ID };

export const YT_CARRIER_CODE = "fuuffy";

// Mock-phase placeholder for the ShipItAsia HK YT hub. Replace via
// warehouse-level config when real fulfilment goes live.
// W5: mock-phase address — replace via per-warehouse config at go-live
const YT_HUB_RECEIVER_ADDRESS: ReceiverAddress = {
  name: "ShipItAsia HK YT Hub",
  phone: "+852 2345 6789",
  country_code: "HK",
  city: "九龍",
  district: "觀塘",
  address: "觀塘巧明街100號友邦九龍大廈20樓",
  postal_code: "000",
};

export async function getOrCreateTodayYtOutbound(
  warehouseCode: string
): Promise<{ outbound_id: string; created: boolean }> {
  if (!warehouseCode) {
    throw new ApiError("WAREHOUSE_NOT_FOUND");
  }
  const db = await connectToDatabase();
  // HK warehouse-day anchor — see lib/time-hk.ts. UTC boundaries would
  // split a workday at 08:00 HK, which doesn't match how 倉庫 thinks
  // about "today's YT outbound".
  const dayStart = startOfHkDay();
  const dayEnd = endOfHkDay();

  const existing = await db.collection(collections.OUTBOUND).findOne({
    is_yt: true,
    warehouseCode,
    createdAt: { $gte: dayStart, $lte: dayEnd },
    // Only consider open rows (not yet departed / cancelled) for
    // append. If today's outbound has shipped, a new one is created.
    status: {
      $nin: ["departed", "cancelled", "completed"],
    },
  });
  if (existing) {
    return { outbound_id: String(existing._id), created: false };
  }

  // Resolve the WMS-owned (system) fuuffy carrier account. Migration
  // 20260521000002 must have been run; if not, this throws with a
  // friendly error pointing at the migration.
  const resolved = await resolveCarrierAccount({
    _id: "(pending — yt outbound not yet created)",
    is_yt: true,
    carrier_code: YT_CARRIER_CODE,
    client_id: SYSTEM_CLIENT_ID,
    carrier_account_id: null,
  });

  const outbound_id = await nextDailyId("OUT");
  const now = new Date();
  await db.collection(collections.OUTBOUND).insertOne(
    {
      _id: outbound_id as any,
      client_id: SYSTEM_CLIENT_ID,
      warehouseCode,
      shipment_type: "consolidated",
      inbound_count: 0,
      carrier_code: YT_CARRIER_CODE,
      carrier_account_id: resolved.account_id,
      service_code: null,
      destination_country: YT_HUB_RECEIVER_ADDRESS.country_code,
      receiver_address: YT_HUB_RECEIVER_ADDRESS,
      processing_preference: "auto",
      status: "ready_for_label",
      held_reason: null,
      held_since: null,
      held_detail: null,
      declared_weight_kg: 0,
      actual_weight_kg: null,
      actual_dimension: null,
      rate_quote: null,
      quoted_amount_hkd: null,
      label_url: null,
      label_obtained_at: null,
      tracking_no: null,
      departed_at: null,
      cancelled_at: null,
      cancel_reason: null,
      cancelled_by_actor_type: null,
      customer_remarks: null,
      batch_id: null,
      disallow_consolidation: false,
      cargo_categories: [],
      is_yt: true,
      auto_generated: true,
      createdAt: now,
      updatedAt: now,
    } as any
  );
  return { outbound_id, created: true };
}

export async function appendYtInbound(input: {
  inbound_id: string;
  warehouseCode: string;
}): Promise<{ outbound_id: string; inbound_count: number }> {
  const db = await connectToDatabase();
  const { outbound_id } = await getOrCreateTodayYtOutbound(input.warehouseCode);

  const session = getMongoClient().startSession();
  let inbound_count = 0;
  try {
    await session.withTransaction(async () => {
      // Idempotent link insert — the unique (outbound_id, inbound_id)
      // index makes the second call a no-op.
      try {
        await db.collection(collections.OUTBOUND_INBOUND_LINK).insertOne(
          {
            outbound_id,
            inbound_id: input.inbound_id,
            client_id: SYSTEM_CLIENT_ID,
            linked_at: new Date(),
            unlinked_at: null,
            unlink_reason: null,
          } as any,
          { session }
        );
        await db
          .collection(collections.OUTBOUND)
          .updateOne(
            { _id: outbound_id as any },
            { $inc: { inbound_count: 1 }, $set: { updatedAt: new Date() } },
            { session }
          );
      } catch (e: any) {
        // duplicate-key on the link → already appended; not an error.
        if (e?.code !== 11000) throw e;
      }
      const refreshed = await db
        .collection(collections.OUTBOUND)
        .findOne({ _id: outbound_id as any }, { session });
      inbound_count = refreshed?.inbound_count ?? 0;
    });
  } finally {
    await session.endSession();
  }
  return { outbound_id, inbound_count };
}

// P17 — schedule-pickup (call-for-carrier-collection) service.
//
// After C6 depart-double-scan confirms every box for the day has left
// the WMS dock, the operator presses "安排攬收" to invoke the carrier's
// pickup API. In v1 mock phase this is a deterministic stub that
// reserves a `pickup_requests` doc and returns a fake pickup_id + ETA;
// the real Fuuffy / YunExpress / UPS call lands at production cutover.
//
// Contract:
//   - Caller scopes pickup by (warehouseCode, carrier_code, optional
//     scheduled_for date). We sweep all outbounds that are status
//     "departed" + carrier match + within the scheduled day + not yet
//     pickup-scheduled.
//   - If no eligible outbounds → throws NO_PICKUP_ELIGIBLE (caller's
//     UI hides the button anyway, but server enforces).
//   - On success: writes pickup_requests row, stamps
//     pickup_request_id + pickup_scheduled_at on each outbound, audits.
//   - On adapter failure: writes audit pickup_schedule_failed and
//     rethrows the original ApiError untouched so the UI can show the
//     real cause + offer a retry.
//
// Idempotency: caller-side dedupe by (warehouseCode, carrier_code,
// scheduled_for). Hitting this twice in the same minute creates two
// pickup_requests rows — that's intentional in mock phase so testing
// can simulate carrier re-bookings. Production version should add a
// pending-pickup lock per (warehouse, carrier, day).

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase, getMongoClient } from "@/lib/mongo";
import { endOfHkDay, startOfHkDay } from "@/lib/time-hk";
import { logAudit } from "@/services/audit/log";
import { nextDailyId } from "@/services/util/daily-counter";

interface SchedulePickupCtx {
  staff_id: string;
  warehouseCode: string;
  ip_address?: string;
  user_agent?: string;
}

export interface SchedulePickupInput {
  carrier_code: string;
  scheduled_for?: Date; // defaults to today (UTC)
}

export interface SchedulePickupResult {
  pickup_id: string;
  carrier_code: string;
  scheduled_for: Date;
  eta_window: { start: Date; end: Date };
  outbound_ids: string[];
  created_at: Date;
}

async function mockCarrierSchedulePickup(input: {
  carrier_code: string;
  warehouseCode: string;
  scheduled_for: Date;
  outbound_count: number;
}): Promise<{ external_pickup_id: string; eta_window: { start: Date; end: Date } }> {
  // Real adapter would call carrier API here. Mock:
  //   - external_pickup_id format mirrors UPS pickup request format so
  //     downstream UI can render plausibly.
  //   - eta_window: 14:00–18:00 HK local on the scheduled day.
  const stampHex = Math.floor(input.scheduled_for.getTime() / 1000)
    .toString(16)
    .toUpperCase()
    .slice(-8);
  const external_pickup_id = `MOCK-PU-${input.carrier_code.toUpperCase()}-${stampHex}`;
  const dayStart = startOfHkDay(input.scheduled_for);
  // 14:00 HK = 06:00 UTC; 18:00 HK = 10:00 UTC.
  const start = new Date(dayStart.getTime() + 14 * 60 * 60 * 1000);
  const end = new Date(dayStart.getTime() + 18 * 60 * 60 * 1000);
  return { external_pickup_id, eta_window: { start, end } };
}

export async function schedulePickup(
  input: SchedulePickupInput,
  ctx: SchedulePickupCtx
): Promise<SchedulePickupResult> {
  if (!input.carrier_code) {
    throw new ApiError("CARRIER_NOT_FOUND");
  }
  const scheduled_for = input.scheduled_for ?? new Date();
  const dayStart = startOfHkDay(scheduled_for);
  const dayEnd = endOfHkDay(scheduled_for);

  const db = await connectToDatabase();
  const eligible = await db
    .collection(collections.OUTBOUND)
    .find({
      warehouseCode: ctx.warehouseCode,
      carrier_code: input.carrier_code,
      status: "departed",
      departed_at: { $gte: dayStart, $lte: dayEnd },
      pickup_request_id: { $in: [null, undefined] as any },
    })
    .project({ _id: 1, is_yt: 1 })
    .toArray();

  if (eligible.length === 0) {
    throw new ApiError("NO_PICKUP_ELIGIBLE", {
      detail: `no departed ${input.carrier_code} outbounds at ${ctx.warehouseCode} for ${dayStart.toISOString().slice(0, 10)}`,
    });
  }

  const outbound_ids = eligible.map((d) => String(d._id));
  let adapter_result: { external_pickup_id: string; eta_window: { start: Date; end: Date } };
  try {
    adapter_result = await mockCarrierSchedulePickup({
      carrier_code: input.carrier_code,
      warehouseCode: ctx.warehouseCode,
      scheduled_for: dayStart,
      outbound_count: outbound_ids.length,
    });
  } catch (err: any) {
    await logAudit({
      action: AUDIT_ACTIONS.pickup_schedule_failed,
      actor_type: AUDIT_ACTOR_TYPES.wms_staff,
      actor_id: ctx.staff_id,
      target_type: AUDIT_TARGET_TYPES.pickup_request,
      target_id: "(unsaved)",
      details: {
        carrier_code: input.carrier_code,
        scheduled_for: dayStart,
        outbound_count: outbound_ids.length,
        error: err?.code ?? err?.message ?? "unknown",
      },
      warehouse_code: ctx.warehouseCode,
      ip_address: ctx.ip_address,
      user_agent: ctx.user_agent,
    });
    throw err;
  }

  const pickup_id = await nextDailyId("PU");
  const now = new Date();
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(collections.PICKUP_REQUEST).insertOne(
        {
          _id: pickup_id as any,
          warehouseCode: ctx.warehouseCode,
          carrier_code: input.carrier_code,
          scheduled_for: dayStart,
          eta_window: adapter_result.eta_window,
          external_pickup_id: adapter_result.external_pickup_id,
          outbound_ids,
          outbound_count: outbound_ids.length,
          status: "scheduled",
          created_by_staff_id: ctx.staff_id,
          createdAt: now,
          updatedAt: now,
        } as any,
        { session }
      );
      await db.collection(collections.OUTBOUND).updateMany(
        { _id: { $in: outbound_ids as any } },
        {
          $set: {
            pickup_request_id: pickup_id,
            pickup_scheduled_at: now,
            updatedAt: now,
          },
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await logAudit({
    action: AUDIT_ACTIONS.pickup_scheduled,
    actor_type: AUDIT_ACTOR_TYPES.wms_staff,
    actor_id: ctx.staff_id,
    target_type: AUDIT_TARGET_TYPES.pickup_request,
    target_id: pickup_id,
    details: {
      carrier_code: input.carrier_code,
      scheduled_for: dayStart,
      eta_window: adapter_result.eta_window,
      external_pickup_id: adapter_result.external_pickup_id,
      outbound_count: outbound_ids.length,
      outbound_ids,
    },
    warehouse_code: ctx.warehouseCode,
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  return {
    pickup_id,
    carrier_code: input.carrier_code,
    scheduled_for: dayStart,
    eta_window: adapter_result.eta_window,
    outbound_ids,
    created_at: now,
  };
}

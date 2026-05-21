// P17 — schedule-pickup (call-for-carrier-collection) service.
//
// Handoff design (print page bulk pickup action bar):
//   "勾選 N 組 → 按「安排攬收」→ 後端按 carrier 自動分批 → toast
//    返「SF 2 組 · YM 1 組」"
//
// So the public entry is multi-outbound by ID; the service groups by
// carrier_code internally and issues one pickup_requests row per
// carrier. The mock adapter is per-carrier; production swap is the
// same per-carrier loop.
//
// Validation:
//   - Every outbound must exist + be status="departed" + same
//     warehouseCode as the caller + not already pickup-scheduled.
//   - If any fails, the whole call rejects (no partial scheduling).
//     The print-page UI already gates the checkbox so users shouldn't
//     hit this in practice; the server check is the safety net.
//
// Output shape feeds the toast directly: `breakdown[].carrier_code` +
// `outbound_count` is the "SF 2 組" string the frontend renders.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase, getMongoClient } from "@/lib/mongo";
import { startOfHkDay } from "@/lib/time-hk";
import { logAudit } from "@/services/audit/log";
import { nextDailyId } from "@/services/util/daily-counter";

interface SchedulePickupCtx {
  staff_id: string;
  warehouseCode: string;
  ip_address?: string;
  user_agent?: string;
}

export interface SchedulePickupForOutboundsInput {
  outbound_ids: string[];
  scheduled_for?: Date; // defaults to today HK
}

export interface CarrierPickupBatch {
  carrier_code: string;
  pickup_id: string;
  external_pickup_id: string;
  eta_window: { start: Date; end: Date };
  outbound_count: number;
  outbound_ids: string[];
}

export interface SchedulePickupForOutboundsResult {
  scheduled_for: Date;
  total_outbounds: number;
  breakdown: CarrierPickupBatch[];
  created_at: Date;
}

async function mockCarrierSchedulePickup(input: {
  carrier_code: string;
  scheduled_for: Date;
  outbound_count: number;
}): Promise<{ external_pickup_id: string; eta_window: { start: Date; end: Date } }> {
  // Real adapter would call the carrier API here. Mock:
  //   - external_pickup_id format mirrors UPS pickup-request style.
  //   - eta_window: 14:00–18:00 HK on the scheduled day.
  const stampHex = Math.floor(input.scheduled_for.getTime() / 1000)
    .toString(16)
    .toUpperCase()
    .slice(-8);
  const external_pickup_id = `MOCK-PU-${input.carrier_code.toUpperCase()}-${stampHex}`;
  const dayStart = startOfHkDay(input.scheduled_for);
  const start = new Date(dayStart.getTime() + 14 * 60 * 60 * 1000);
  const end = new Date(dayStart.getTime() + 18 * 60 * 60 * 1000);
  return { external_pickup_id, eta_window: { start, end } };
}

export async function schedulePickupForOutbounds(
  input: SchedulePickupForOutboundsInput,
  ctx: SchedulePickupCtx
): Promise<SchedulePickupForOutboundsResult> {
  const ids = Array.from(new Set(input.outbound_ids ?? [])).filter(Boolean);
  if (ids.length === 0) {
    throw new ApiError("NO_PICKUP_ELIGIBLE", {
      detail: "outbound_ids is empty",
    });
  }
  const scheduled_for = input.scheduled_for ?? new Date();
  const dayStart = startOfHkDay(scheduled_for);

  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.OUTBOUND)
    .find({ _id: { $in: ids as any } })
    .project({
      _id: 1,
      warehouseCode: 1,
      carrier_code: 1,
      status: 1,
      pickup_request_id: 1,
    })
    .toArray();

  if (docs.length !== ids.length) {
    const found = new Set(docs.map((d) => String(d._id)));
    const missing = ids.filter((id) => !found.has(id));
    throw new ApiError("NO_PICKUP_ELIGIBLE", {
      detail: `outbound(s) not found: ${missing.join(",")}`,
    });
  }
  // Per handoff: 攬收 fires at the print step (after labels are printed,
  // before physical depart). Accept "label_printed" + "departed" so
  // either order works — handoff path schedules first then departs,
  // legacy flow could depart first then schedule. Anything earlier
  // (label_obtained, weighing, ...) is too early — labels aren't yet
  // physically on the boxes.
  const ELIGIBLE_STATUSES = new Set(["label_printed", "departed"]);
  for (const d of docs) {
    if (d.warehouseCode !== ctx.warehouseCode) {
      throw new ApiError("NO_PICKUP_ELIGIBLE", {
        detail: `${d._id} belongs to ${d.warehouseCode}, expected ${ctx.warehouseCode}`,
      });
    }
    if (!ELIGIBLE_STATUSES.has(d.status)) {
      throw new ApiError("NO_PICKUP_ELIGIBLE", {
        detail: `${d._id} status=${d.status}, expected label_printed or departed`,
      });
    }
    if (d.pickup_request_id) {
      throw new ApiError("NO_PICKUP_ELIGIBLE", {
        detail: `${d._id} already scheduled under pickup ${d.pickup_request_id}`,
      });
    }
  }

  // Group by carrier_code. One pickup_requests doc + one carrier API
  // call per carrier so the toast / audit trail stay 1:1 with the
  // physical pickup.
  const byCarrier = new Map<string, string[]>();
  for (const d of docs) {
    const list = byCarrier.get(d.carrier_code) ?? [];
    list.push(String(d._id));
    byCarrier.set(d.carrier_code, list);
  }

  const breakdown: CarrierPickupBatch[] = [];
  const now = new Date();
  for (const [carrier_code, outbound_ids] of byCarrier) {
    let adapter_result: { external_pickup_id: string; eta_window: { start: Date; end: Date } };
    try {
      adapter_result = await mockCarrierSchedulePickup({
        carrier_code,
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
          carrier_code,
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
    const session = getMongoClient().startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection(collections.PICKUP_REQUEST).insertOne(
          {
            _id: pickup_id as any,
            warehouseCode: ctx.warehouseCode,
            carrier_code,
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
        carrier_code,
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

    breakdown.push({
      carrier_code,
      pickup_id,
      external_pickup_id: adapter_result.external_pickup_id,
      eta_window: adapter_result.eta_window,
      outbound_count: outbound_ids.length,
      outbound_ids,
    });
  }

  return {
    scheduled_for: dayStart,
    total_outbounds: docs.length,
    breakdown,
    created_at: now,
  };
}

// P14 — read + lifecycle ops on consolidation_groups. The actual sweep
// (managed_consign auto-outbound) lives in P15 cron logic; this module
// only exposes what OMS needs at submit time + on the inbound detail page.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { addWorkingDays } from "@/services/consolidation/working-days";
import {
  MANAGED_CONSIGN_SLA_WORKING_DAYS,
} from "@/services/consolidation/sweep";
import { nextDailyId } from "@/services/util/daily-counter";
import { ObjectId } from "mongodb";

export interface PendingGroupSummary {
  group_id: string;
  warehouseCode: string;
  saved_address_id: string;
  carrier_account_id: string;
  oldest_received_at: Date | null;
  // Pre-formatted YYYY/MM/DD strings so the UI doesn't have to recompute
  // working-day arithmetic client-side. `sweep_due_ymd` is the projected
  // auto-ship date if no further inbound joins the group.
  oldest_received_at_ymd: string | null;
  sweep_due_ymd: string | null;
  days_since_oldest: number | null; // calendar days, null when nothing has shelved yet
  forecast_count: number;
  received_forecast_count: number;
}

function calendarDaysSince(d: Date | null): number | null {
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function toYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

// Bulk read: every pending group the client owns. Powers the P14b "處理中"
// inbound list which renders managed_consign rows grouped by their parent
// pending group with summary metadata in the header.
export async function listPendingGroupsForClient(
  client_id: string
): Promise<PendingGroupSummary[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.CONSOLIDATION_GROUP)
    .find({ client_id, status: "pending" })
    .sort({ createdAt: 1 })
    .toArray();
  const out: PendingGroupSummary[] = [];
  for (const group of docs) {
    const forecast_ids: string[] = group.forecast_ids ?? [];
    const received_forecast_count = forecast_ids.length
      ? await db.collection(collections.INBOUND).countDocuments({
          _id: { $in: forecast_ids } as any,
          receivedAt: { $ne: null },
        })
      : 0;
    const oldest = group.oldest_received_at
      ? new Date(group.oldest_received_at)
      : null;
    const sweepDue = oldest
      ? await addWorkingDays(
          db,
          group.warehouseCode,
          oldest,
          MANAGED_CONSIGN_SLA_WORKING_DAYS
        )
      : null;
    out.push({
      group_id: String(group._id),
      warehouseCode: group.warehouseCode,
      saved_address_id: group.saved_address_id,
      carrier_account_id: group.carrier_account_id,
      oldest_received_at: oldest,
      oldest_received_at_ymd: oldest ? toYmd(oldest) : null,
      sweep_due_ymd: sweepDue ? toYmd(sweepDue) : null,
      days_since_oldest: calendarDaysSince(oldest),
      forecast_count: forecast_ids.length,
      received_forecast_count,
    });
  }
  return out;
}

// Pop-up trigger: same (client, warehouse, saved_address, carrier) tuple. If
// the customer has multiple pending groups for the same tuple (which can
// happen when a previous submit chose "ship on original schedule"), we
// surface the OLDEST one — that is the one closest to the SLA deadline and
// therefore the most useful for the "等齊一起寄" decision.
export async function findPendingGroupForChoice(args: {
  client_id: string;
  warehouseCode: string;
  saved_address_id: string;
  carrier_account_id: string;
}): Promise<PendingGroupSummary | null> {
  const db = await connectToDatabase();
  const group = await db
    .collection(collections.CONSOLIDATION_GROUP)
    .find({
      client_id: args.client_id,
      warehouseCode: args.warehouseCode,
      saved_address_id: args.saved_address_id,
      carrier_account_id: args.carrier_account_id,
      status: "pending",
    })
    .sort({ createdAt: 1 })
    .limit(1)
    .next();
  if (!group) return null;
  const forecast_ids: string[] = group.forecast_ids ?? [];
  const received_forecast_count = forecast_ids.length
    ? await db.collection(collections.INBOUND).countDocuments({
        _id: { $in: forecast_ids } as any,
        receivedAt: { $ne: null },
      })
    : 0;
  const oldest = group.oldest_received_at
    ? new Date(group.oldest_received_at)
    : null;
  const sweepDue = oldest
    ? await addWorkingDays(
        db,
        group.warehouseCode,
        oldest,
        MANAGED_CONSIGN_SLA_WORKING_DAYS
      )
    : null;
  return {
    group_id: String(group._id),
    warehouseCode: group.warehouseCode,
    saved_address_id: group.saved_address_id,
    carrier_account_id: group.carrier_account_id,
    oldest_received_at: oldest,
    oldest_received_at_ymd: oldest ? toYmd(oldest) : null,
    sweep_due_ymd: sweepDue ? toYmd(sweepDue) : null,
    days_since_oldest: calendarDaysSince(oldest),
    forecast_count: forecast_ids.length,
    received_forecast_count,
  };
}

// "立即排出庫" — flips the group from `pending` to `force_released`. The P15
// cron treats force_released groups as "sweep on the next pass without
// waiting for the 3-working-day SLA". The group's forecast_ids stay frozen;
// any new managed_consign inbound for the same tuple starts a fresh group.
//
// When `inbound_ids` is supplied (P14b), only that subset is force-released:
// the chosen forecasts split off into a new force_released group while the
// remaining shelved forecasts keep waiting in the original pending group
// (oldest_received_at is recomputed off the survivors).
export async function forceReleaseGroup(args: {
  client_id: string;
  group_id: string;
  inbound_ids?: string[];
}): Promise<{
  group_id: string;
  status: "force_released";
  released_inbound_ids: string[];
  remaining_inbound_ids: string[];
}> {
  if (args.inbound_ids && args.inbound_ids.length > 0) {
    return forceReleaseGroupSubset(args as Required<typeof args>);
  }
  const db = await connectToDatabase();
  const now = new Date();
  const res = await db.collection(collections.CONSOLIDATION_GROUP).findOneAndUpdate(
    {
      _id: args.group_id as any,
      client_id: args.client_id,
      status: "pending",
    },
    {
      $set: {
        status: "force_released",
        force_released_at: now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );
  const updated =
    res && (res as any).value !== undefined ? (res as any).value : res;
  if (!updated) {
    const existing = await db
      .collection(collections.CONSOLIDATION_GROUP)
      .findOne({ _id: args.group_id as any, client_id: args.client_id });
    if (!existing) throw new ApiError("CONSOLIDATION_GROUP_NOT_FOUND");
    throw new ApiError("CONSOLIDATION_GROUP_NOT_RELEASABLE");
  }
  return {
    group_id: String(updated._id),
    status: "force_released",
    released_inbound_ids: updated.forecast_ids ?? [],
    remaining_inbound_ids: [],
  };
}

async function forceReleaseGroupSubset(args: {
  client_id: string;
  group_id: string;
  inbound_ids: string[];
}): Promise<{
  group_id: string;
  status: "force_released";
  released_inbound_ids: string[];
  remaining_inbound_ids: string[];
}> {
  const db = await connectToDatabase();
  const now = new Date();
  const parent = await db
    .collection(collections.CONSOLIDATION_GROUP)
    .findOne({ _id: args.group_id as any, client_id: args.client_id });
  if (!parent) throw new ApiError("CONSOLIDATION_GROUP_NOT_FOUND");
  if (parent.status !== "pending")
    throw new ApiError("CONSOLIDATION_GROUP_NOT_RELEASABLE");

  const groupForecastIds: string[] = parent.forecast_ids ?? [];
  const requested = Array.from(new Set(args.inbound_ids));
  // Every requested id must (a) belong to this group and (b) already be
  // shelved. Anything that fails either check rejects the whole request so
  // the customer doesn't get a half-applied release they didn't intend.
  const groupSet = new Set(groupForecastIds);
  for (const id of requested) {
    if (!groupSet.has(id))
      throw new ApiError("CONSOLIDATION_RELEASE_INBOUND_NOT_IN_GROUP");
  }
  const shelvedDocs = await db
    .collection(collections.INBOUND)
    .find({
      _id: { $in: requested } as any,
      client_id: args.client_id,
      receivedAt: { $ne: null },
    })
    .toArray();
  if (shelvedDocs.length !== requested.length)
    throw new ApiError("CONSOLIDATION_RELEASE_INBOUND_NOT_SHELVED");

  const requestedSet = new Set(requested);
  const remaining = groupForecastIds.filter((id) => !requestedSet.has(id));
  // Compute the new oldest_received_at for the parent over the SHELVED
  // survivors (unshelved siblings don't anchor the SLA — see scan-service:
  // receivedAt sets the anchor).
  const remainingShelved = remaining.length
    ? await db
        .collection(collections.INBOUND)
        .find({
          _id: { $in: remaining } as any,
          client_id: args.client_id,
          receivedAt: { $ne: null },
        })
        .toArray()
    : [];
  const newOldest = remainingShelved.length
    ? new Date(
        Math.min(
          ...remainingShelved.map((d: any) =>
            new Date(d.receivedAt).getTime()
          )
        )
      )
    : null;

  const newGroupId = await nextDailyId("CG");
  await db.collection(collections.CONSOLIDATION_GROUP).insertOne({
    _id: newGroupId as any,
    client_id: parent.client_id,
    warehouseCode: parent.warehouseCode,
    saved_address_id: parent.saved_address_id,
    carrier_account_id: parent.carrier_account_id,
    status: "force_released",
    oldest_received_at: parent.oldest_received_at ?? null,
    forecast_ids: requested,
    swept_at: null,
    swept_outbound_id: null,
    force_released_at: now,
    split_from_group_id: String(parent._id),
    createdAt: now,
    updatedAt: now,
  } as any);

  await db.collection(collections.INBOUND).updateMany(
    { _id: { $in: requested } as any, client_id: args.client_id },
    { $set: { consolidation_group_id: newGroupId, updatedAt: now } }
  );

  await db.collection(collections.CONSOLIDATION_GROUP).updateOne(
    { _id: parent._id },
    {
      $set: {
        forecast_ids: remaining,
        oldest_received_at: newOldest,
        updatedAt: now,
      },
    }
  );

  return {
    group_id: newGroupId,
    status: "force_released",
    released_inbound_ids: requested,
    remaining_inbound_ids: remaining,
  };
}

// Used by inbound-detail UI: given an inbound id, fetch the parent group's
// public summary. Returns null when the inbound is not managed_consign or
// its group is no longer pending.
export async function getInboundGroupSummary(args: {
  client_id: string;
  inbound_id: string;
}): Promise<(PendingGroupSummary & { status: string }) | null> {
  const db = await connectToDatabase();
  const inbound = await db
    .collection(collections.INBOUND)
    .findOne(
      { _id: args.inbound_id as any, client_id: args.client_id },
      { projection: { consolidation_group_id: 1 } }
    );
  if (!inbound?.consolidation_group_id) return null;
  const group = await db
    .collection(collections.CONSOLIDATION_GROUP)
    .findOne({ _id: inbound.consolidation_group_id });
  if (!group) return null;
  const forecast_ids: string[] = group.forecast_ids ?? [];
  const received_forecast_count = forecast_ids.length
    ? await db.collection(collections.INBOUND).countDocuments({
        _id: { $in: forecast_ids } as any,
        receivedAt: { $ne: null },
      })
    : 0;
  const oldest = group.oldest_received_at
    ? new Date(group.oldest_received_at)
    : null;
  const sweepDue = oldest
    ? await addWorkingDays(
        db,
        group.warehouseCode,
        oldest,
        MANAGED_CONSIGN_SLA_WORKING_DAYS
      )
    : null;
  return {
    group_id: String(group._id),
    warehouseCode: group.warehouseCode,
    saved_address_id: group.saved_address_id,
    carrier_account_id: group.carrier_account_id,
    oldest_received_at: oldest,
    oldest_received_at_ymd: oldest ? toYmd(oldest) : null,
    sweep_due_ymd: sweepDue ? toYmd(sweepDue) : null,
    days_since_oldest: calendarDaysSince(oldest),
    forecast_count: forecast_ids.length,
    received_forecast_count,
    status: group.status,
  };
}

// Silence unused import warning while ObjectId stays available for future
// helpers (groups currently key on the string daily counter id).
void ObjectId;

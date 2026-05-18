// P15 — daily sweep for managed_consign consolidation groups. Reads every
// non-terminal group, decides whether to fire its outbound, and reports a
// summary the cron log can store.
//
// Fire rules per group.status:
//   pending          — fire when (A) every member inbound is `received`
//                      AND (B) oldest_received_at + 3 working days has
//                      elapsed (per warehouse's working_calendars row, or
//                      Mon-Fri fallback when the calendar is empty).
//   force_released   — fire on the next pass without waiting for the SLA.
//                      Ships the currently-shelved subset only; any still-
//                      unshelved forecasts are detached into a fresh
//                      `pending` group so the customer can keep waiting.
//   swept            — terminal, ignored.
//
// On fire: createConsolidatedOutbound with the group's saved_address +
// carrier_account; mark the group `swept` with the outbound id; the
// inbound rows already carry consolidation_group_id and continue through
// the existing P10-P12 pick/pack/palletize flow.

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { nextDailyId } from "@/services/util/daily-counter";
import { createConsolidatedOutbound } from "@/services/outbound/outbound-service";
import { hasSlaElapsed } from "@/services/consolidation/working-days";
import { ObjectId } from "mongodb";

export const MANAGED_CONSIGN_SLA_WORKING_DAYS = 3;

export interface SweepGroupResult {
  group_id: string;
  status_before: string;
  outcome:
    | "fired"
    | "skipped_not_all_shelved"
    | "skipped_sla_not_elapsed"
    | "skipped_force_released_nothing_shelved"
    | "skipped_missing_master_data"
    | "errored";
  outbound_id?: string;
  new_pending_group_id?: string;
  error?: string;
}

export interface SweepReport {
  scanned: number;
  fired: number;
  skipped: number;
  errored: number;
  groups: SweepGroupResult[];
  ran_at: Date;
}

interface Inbound {
  _id: string;
  client_id: string;
  warehouseCode: string;
  receivedAt: Date | null;
  status: string;
  customer_remarks: string | null;
}

async function loadGroupInbounds(
  db: any,
  forecast_ids: string[]
): Promise<Inbound[]> {
  if (forecast_ids.length === 0) return [];
  const docs = await db
    .collection(collections.INBOUND)
    .find({ _id: { $in: forecast_ids } })
    .toArray();
  return docs.map((d: any) => ({
    _id: String(d._id),
    client_id: d.client_id,
    warehouseCode: d.warehouseCode,
    receivedAt: d.receivedAt ?? null,
    status: d.status,
    customer_remarks: d.customer_remarks ?? null,
  }));
}

async function fireGroupOutbound(
  db: any,
  group: any,
  shelvedInbounds: Inbound[],
  now: Date
): Promise<{ outbound_id: string }> {
  // Saved address + carrier account are required to materialise the
  // outbound. They were validated at create time, but a customer could
  // have deleted them between create + sweep — surface that with a
  // skipped_missing_master_data outcome instead of crashing the whole run.
  let savedAddrOid: ObjectId;
  try {
    savedAddrOid = new ObjectId(group.saved_address_id);
  } catch {
    throw new Error("invalid_saved_address_id");
  }
  const savedAddress = await db
    .collection(collections.SAVED_ADDRESS)
    .findOne({ _id: savedAddrOid, client_id: group.client_id });
  if (!savedAddress) throw new Error("saved_address_deleted");

  let carrierAcctOid: ObjectId;
  try {
    carrierAcctOid = new ObjectId(group.carrier_account_id);
  } catch {
    throw new Error("invalid_carrier_account_id");
  }
  const carrierAccount = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .findOne({
      _id: carrierAcctOid,
      client_id: group.client_id,
      status: "active",
      deleted_at: null,
    });
  if (!carrierAccount) throw new Error("carrier_account_unavailable");

  const receiver_address = {
    name: savedAddress.name,
    phone: savedAddress.phone,
    country_code: savedAddress.country_code,
    city: savedAddress.city,
    ...(savedAddress.district ? { district: savedAddress.district } : {}),
    address: savedAddress.address,
    ...(savedAddress.postal_code
      ? { postal_code: savedAddress.postal_code }
      : {}),
  };

  // Roll the customer's per-inbound remarks into a single line so they
  // survive the auto-merge into one outbound.
  const remarksMerged = shelvedInbounds
    .map((i) => i.customer_remarks)
    .filter((r): r is string => !!r && r.length > 0)
    .join(" | ")
    .slice(0, 500);

  const outbound = await createConsolidatedOutbound(
    { client_id: group.client_id },
    {
      inbound_ids: shelvedInbounds.map((i) => i._id),
      carrier_code: carrierAccount.carrier_code,
      carrier_account_id: String(carrierAccount._id),
      receiver_address,
      processing_preference: "auto",
      ...(remarksMerged ? { customer_remarks: remarksMerged } : {}),
    }
  );

  await db.collection(collections.CONSOLIDATION_GROUP).updateOne(
    { _id: group._id },
    {
      $set: {
        status: "swept",
        swept_at: now,
        swept_outbound_id: outbound._id,
        updatedAt: now,
      },
    }
  );
  return { outbound_id: outbound._id };
}

async function detachUnshelvedToNewGroup(
  db: any,
  parentGroup: any,
  unshelvedInbounds: Inbound[],
  now: Date
): Promise<string | null> {
  if (unshelvedInbounds.length === 0) return null;
  const newGroupId = await nextDailyId("CG");
  await db.collection(collections.CONSOLIDATION_GROUP).insertOne({
    _id: newGroupId as any,
    client_id: parentGroup.client_id,
    warehouseCode: parentGroup.warehouseCode,
    saved_address_id: parentGroup.saved_address_id,
    carrier_account_id: parentGroup.carrier_account_id,
    status: "pending",
    oldest_received_at: null,
    forecast_ids: unshelvedInbounds.map((i) => i._id),
    swept_at: null,
    swept_outbound_id: null,
    detached_from_group_id: String(parentGroup._id),
    createdAt: now,
    updatedAt: now,
  } as any);
  await db.collection(collections.INBOUND).updateMany(
    { _id: { $in: unshelvedInbounds.map((i) => i._id) } as any },
    { $set: { consolidation_group_id: newGroupId, updatedAt: now } }
  );
  return newGroupId;
}

async function sweepOneGroup(
  db: any,
  group: any,
  now: Date
): Promise<SweepGroupResult> {
  const base: SweepGroupResult = {
    group_id: String(group._id),
    status_before: group.status,
    outcome: "errored",
  };
  try {
    const forecast_ids: string[] = group.forecast_ids ?? [];
    const inbounds = await loadGroupInbounds(db, forecast_ids);
    const shelved = inbounds.filter(
      (i) => i.receivedAt && i.status !== "cancelled" && i.status !== "abandoned"
    );
    const unshelved = inbounds.filter(
      (i) => !i.receivedAt && i.status !== "cancelled" && i.status !== "abandoned"
    );

    if (group.status === "pending") {
      // Condition A: every active member must be shelved.
      if (unshelved.length > 0) {
        return { ...base, outcome: "skipped_not_all_shelved" };
      }
      // Condition B: SLA elapsed.
      if (!group.oldest_received_at) {
        return { ...base, outcome: "skipped_not_all_shelved" };
      }
      const elapsed = await hasSlaElapsed(
        db,
        group.warehouseCode,
        new Date(group.oldest_received_at),
        MANAGED_CONSIGN_SLA_WORKING_DAYS,
        now
      );
      if (!elapsed) {
        return { ...base, outcome: "skipped_sla_not_elapsed" };
      }
      const { outbound_id } = await fireGroupOutbound(db, group, shelved, now);
      return { ...base, outcome: "fired", outbound_id };
    }

    if (group.status === "force_released") {
      if (shelved.length === 0) {
        return {
          ...base,
          outcome: "skipped_force_released_nothing_shelved",
        };
      }
      const { outbound_id } = await fireGroupOutbound(db, group, shelved, now);
      const detached_id = await detachUnshelvedToNewGroup(
        db,
        group,
        unshelved,
        now
      );
      return {
        ...base,
        outcome: "fired",
        outbound_id,
        ...(detached_id ? { new_pending_group_id: detached_id } : {}),
      };
    }

    // swept / unknown — nothing to do (caller filters but defensive)
    return base;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (
      msg === "saved_address_deleted" ||
      msg === "carrier_account_unavailable" ||
      msg === "invalid_saved_address_id" ||
      msg === "invalid_carrier_account_id"
    ) {
      return { ...base, outcome: "skipped_missing_master_data", error: msg };
    }
    return { ...base, outcome: "errored", error: msg };
  }
}

// P14b — synchronous sweep of a single group, invoked right after the
// customer presses "立即出庫" so they see the outbound materialise in the
// same request cycle (instead of waiting for the next daily cron pass).
export async function sweepGroupById(
  group_id: string
): Promise<SweepGroupResult | null> {
  const db = await connectToDatabase();
  const group = await db
    .collection(collections.CONSOLIDATION_GROUP)
    .findOne({ _id: group_id as any });
  if (!group) return null;
  if (group.status !== "pending" && group.status !== "force_released") {
    return {
      group_id: String(group._id),
      status_before: group.status,
      outcome: "errored",
      error: "group_already_terminal",
    };
  }
  return sweepOneGroup(db, group, new Date());
}

export async function sweepManagedConsignGroups(): Promise<SweepReport> {
  const db = await connectToDatabase();
  const now = new Date();
  const groups = await db
    .collection(collections.CONSOLIDATION_GROUP)
    .find({ status: { $in: ["pending", "force_released"] } })
    .sort({ createdAt: 1 })
    .toArray();
  const results: SweepGroupResult[] = [];
  for (const g of groups) {
    const r = await sweepOneGroup(db, g, now);
    results.push(r);
  }
  return {
    scanned: groups.length,
    fired: results.filter((r) => r.outcome === "fired").length,
    skipped: results.filter((r) => r.outcome.startsWith("skipped_")).length,
    errored: results.filter((r) => r.outcome === "errored").length,
    groups: results,
    ran_at: now,
  };
}

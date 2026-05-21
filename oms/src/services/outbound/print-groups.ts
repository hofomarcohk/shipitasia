// P17 — print-page group aggregator.
//
// Handoff redesigns the print page from per-box to per-group: one row
// per (client_id, destination). YT outbounds naturally collapse into
// one row because they share SYSTEM_CLIENT_ID + the singleton YT hub
// destination.
//
// In-scope statuses: label_obtained → label_printed → (pickup_scheduled).
// Once the group's outbounds all transition to "departed" they fall
// off the print page and surface on the depart page instead.
//
// Group status derivation (worst-state-wins so any unprinted box
// holds the whole group at "ready_to_print"):
//   - any outbound at label_obtained → "ready_to_print"
//   - else any at label_printed without pickup_request_id → "printed"
//   - else any at label_printed WITH pickup_request_id (or any
//     departed) → "pickup_scheduled"
//
// Frontend uses the status field to drive the checkbox-enable
// behaviour (only "printed" rows are selectable per handoff).

import { ObjectId } from "mongodb";

import { collections } from "@/cst/collections";
import { SYSTEM_CLIENT_ID } from "@/cst/system";
import { connectToDatabase } from "@/lib/mongo";

export type PrintGroupStatus =
  | "ready_to_print"
  | "printed"
  | "pickup_scheduled";

export type PrintGroupMode = "consolidated" | "single" | "yt";

export interface PrintGroupBox {
  box_no: string;
  weight: number;
  dimension: { length: number; width: number; height: number } | null;
  tracking_no: string | null;
  label_url: string | null;
  sealed_at: Date | null;
}

export interface PrintGroup {
  group_key: string;
  client_id: string;
  client_name: string;
  carrier_code: string;
  mode: PrintGroupMode;
  destination: {
    country_code: string;
    city: string;
    address: string;
    postal_code: string | null;
  };
  boxes: PrintGroupBox[];
  total_boxes: number;
  total_weight_kg: number;
  status: PrintGroupStatus;
  outbound_ids: string[];
  pickup_request_id: string | null;
  pickup_eta: { start: Date; end: Date } | null;
}

const IN_SCOPE_STATUSES = [
  "label_obtained",
  "label_printed",
  "departed",
] as const;

function destinationKey(o: any): string {
  const addr = o.receiver_address ?? {};
  return [
    o.client_id,
    o.carrier_code,
    addr.country_code ?? "",
    addr.city ?? "",
    addr.address ?? "",
    addr.postal_code ?? "",
  ].join("|");
}

function modeFor(o: any): PrintGroupMode {
  if (o.is_yt) return "yt";
  if (o.shipment_type === "single") return "single";
  return "consolidated";
}

async function loadClientNames(
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const realIds = ids.filter((id) => id !== SYSTEM_CLIENT_ID);
  if (realIds.length > 0) {
    const db = await connectToDatabase();
    const docs = await db
      .collection(collections.CLIENT)
      .find({
        _id: {
          $in: realIds.map((id) =>
            ObjectId.isValid(id) ? new ObjectId(id) : (id as any)
          ) as any,
        },
      })
      .toArray();
    for (const c of docs) {
      const id = String(c._id);
      const name =
        c.company_name ||
        c.company_info?.legal_name ||
        c.display_name ||
        c.email ||
        id;
      map.set(id, name);
    }
  }
  if (ids.includes(SYSTEM_CLIENT_ID)) {
    map.set(SYSTEM_CLIENT_ID, "ShipItAsia YT");
  }
  return map;
}

export interface ListPrintGroupsInput {
  warehouseCode: string;
}

export async function listPrintGroups(
  input: ListPrintGroupsInput
): Promise<PrintGroup[]> {
  const db = await connectToDatabase();
  const outbounds = await db
    .collection(collections.OUTBOUND)
    .find({
      warehouseCode: input.warehouseCode,
      status: { $in: IN_SCOPE_STATUSES as any },
    })
    .toArray();
  if (outbounds.length === 0) return [];

  const clientIds = Array.from(new Set(outbounds.map((o: any) => o.client_id)));
  const clientNames = await loadClientNames(clientIds);

  // Pickup window denormalised: fetch any pickup_request_ids
  // referenced by these outbounds so the group row can render the eta.
  const pickupIds = Array.from(
    new Set(
      outbounds
        .map((o: any) => o.pickup_request_id)
        .filter((id: any): id is string => typeof id === "string")
    )
  );
  const pickupMap = new Map<
    string,
    { start: Date; end: Date }
  >();
  if (pickupIds.length > 0) {
    const pickups = await db
      .collection(collections.PICKUP_REQUEST)
      .find({ _id: { $in: pickupIds as any } })
      .project({ _id: 1, eta_window: 1 })
      .toArray();
    for (const p of pickups) {
      if (p.eta_window) pickupMap.set(String(p._id), p.eta_window);
    }
  }

  const grouped = new Map<string, any[]>();
  for (const o of outbounds) {
    const key = destinationKey(o);
    const arr = grouped.get(key) ?? [];
    arr.push(o);
    grouped.set(key, arr);
  }

  const result: PrintGroup[] = [];
  for (const [group_key, items] of grouped) {
    const first = items[0];
    // Worst-state-wins for group status.
    let status: PrintGroupStatus = "pickup_scheduled";
    for (const o of items) {
      if (o.status === "label_obtained") {
        status = "ready_to_print";
        break;
      }
      if (o.status === "label_printed" && !o.pickup_request_id) {
        status = "printed";
      }
    }

    const boxes: PrintGroupBox[] = [];
    let total_weight_kg = 0;
    for (const o of items) {
      for (const b of o.boxes ?? []) {
        boxes.push({
          box_no: b.box_no,
          weight: b.weight ?? 0,
          dimension:
            b.length != null && b.width != null && b.height != null
              ? { length: b.length, width: b.width, height: b.height }
              : null,
          tracking_no: b.tracking_no ?? null,
          label_url: b.label_url ?? null,
          sealed_at: b.sealed_at ?? null,
        });
        total_weight_kg += b.weight ?? 0;
      }
    }

    // pickup_request_id is per outbound; in practice all outbounds in
    // a group share the same pickup (they're routed together by
    // carrier). Pick the first non-null.
    const pickup_request_id =
      items.find((o: any) => o.pickup_request_id)?.pickup_request_id ?? null;
    const pickup_eta = pickup_request_id
      ? pickupMap.get(pickup_request_id) ?? null
      : null;

    result.push({
      group_key,
      client_id: first.client_id,
      client_name: clientNames.get(first.client_id) ?? first.client_id,
      carrier_code: first.carrier_code,
      mode: modeFor(first),
      destination: {
        country_code: first.receiver_address?.country_code ?? "",
        city: first.receiver_address?.city ?? "",
        address: first.receiver_address?.address ?? "",
        postal_code: first.receiver_address?.postal_code ?? null,
      },
      boxes,
      total_boxes: boxes.length,
      total_weight_kg: Math.round(total_weight_kg * 100) / 100,
      status,
      outbound_ids: items.map((o: any) => String(o._id)),
      pickup_request_id,
      pickup_eta,
    });
  }

  // Sort: ready_to_print first (work to do), then printed, then
  // scheduled. Stable within bucket by client_name.
  const order: Record<PrintGroupStatus, number> = {
    ready_to_print: 0,
    printed: 1,
    pickup_scheduled: 2,
  };
  result.sort((a, b) => {
    const s = order[a.status] - order[b.status];
    if (s !== 0) return s;
    return a.client_name.localeCompare(b.client_name);
  });

  return result;
}

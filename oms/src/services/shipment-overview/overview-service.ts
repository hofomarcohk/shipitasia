// Shipment-overview facade — backend-side aggregation that returns
// data shaped EXACTLY for the v2 OMS overview page. Each function joins
// the underlying collections (inbound, outbound, consolidation_group,
// saved_address, carrier_account/carrier, outbound_box, inbound_declared_item)
// and projects into the same TypeScript types used by the frontend mock so the
// stage views can render the API response with zero adapter logic.

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import type { ShipmentStageKey } from "@/components/shipment/ShipmentPipeline";

/* ============================================================
 * Frontend-shaped types — must match `lib/shipment-mock.ts`
 * ==========================================================*/

type DeliveryMethod = "managed" | "direct" | "manual";

interface WaitingInboundRow {
  id: string;
  items: string;
  sub: "not_arrived" | "arrived";
  method: DeliveryMethod;
  recipient: string;
  carrier: string;
  time: string;
}

interface ConsolidationGroupItem {
  id: string;
  items: string;
  price: string;
  vol?: string;
  time?: string;
  notArrived?: boolean;
}

interface ConsolidationGroup {
  gid: string;
  recipient: string;
  carrier: string;
  total: number;
  shelved: number;
  oldestYmd?: string;
  sweepDueYmd?: string;
  items: ConsolidationGroupItem[];
}

interface ManualPendingRow {
  id: string;
  items: string;
  price: string;
  recipient: string;
  time: string;
}

interface ConsolidateOutboundChild {
  id: string;
  items: string;
  price: string;
  time: string;
}

interface ConsolidateOutbound {
  obid: string;
  total: number;
  value: string;
  recipient: string;
  carrier: string;
  sub: "not_picked" | "picked";
  subLabel: string;
  subVariant: "warn" | "ok" | "info" | "idle";
  time: string;
  children: ConsolidateOutboundChild[];
}

interface BoxItem {
  id: string;
  items: string;
  price: string;
}

interface Box {
  bid: string;
  dim: string;
  weight: string;
  items: BoxItem[];
}

interface OutboundCard {
  obid: string;
  recipient: string;
  carrier: string;
  chips: { label: string; variant: "warn" | "ok" | "info" | "idle" }[];
  totalWeight: string;
  boxCount: number;
  boxes: Box[];
  pickupAt?: string;
}

interface DispatchedRow {
  obid: string;
  cb: string;
  value: string;
  recipient: string;
  carrier: string;
  time: string;
}

/* ============================================================
 * Status filters per pipeline stage
 * ==========================================================*/

const STATUS_WAITING_INBOUND = ["pending", "arrived"];
const STATUS_WAITING_CONSOLIDATE = ["ready_for_label", "picking", "picked"];
const STATUS_CONSOLIDATED = [
  "packing",
  "packed",
  "weighing",
  "weight_verified",
  "pending_client_label",
  "label_obtaining",
  "label_obtained",
];
const STATUS_WAITING_DISPATCH = ["label_printed"];
const STATUS_DISPATCHED = ["departed"];

/* ============================================================
 * Shared helpers
 * ==========================================================*/

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${m}/${day} ${hh}:${mm}`;
}

function fmtYmd(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  const dt = new Date(d);
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

function mapShippingMode(m: string | null | undefined): DeliveryMethod {
  if (m === "managed_consign") return "managed";
  if (m === "single_direct") return "direct";
  return "manual";
}

function formatRecipient(receiver: any, savedAddress: any): string {
  const name = receiver?.name ?? savedAddress?.recipient_name ?? "未設定";
  const city = receiver?.city ?? savedAddress?.city ?? "";
  return city ? `${name} · ${city}` : name;
}

function formatPriceJpy(n: number | null | undefined): string {
  return `¥${(n ?? 0).toLocaleString()}`;
}

/** Build "品項A ×N、品項B ×N" from declared item docs. */
function formatItems(items: { product_name: string; quantity: number }[]): string {
  if (!items.length) return "—";
  const summary = items
    .slice(0, 3)
    .map((it) => `${it.product_name} ×${it.quantity}`)
    .join("、");
  return items.length > 3 ? `${summary} 等 ${items.length} 項` : summary;
}

async function loadCarrierLabels(
  db: any,
  carrierAccountIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(carrierAccountIds.filter(Boolean) as string[])
  );
  if (ids.length === 0) return new Map();
  const accounts = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .find({ _id: { $in: ids } as any })
    .toArray();
  const carrierCodes = Array.from(
    new Set(accounts.map((a: any) => a.carrier_code).filter(Boolean))
  );
  const carriers = carrierCodes.length
    ? await db
        .collection(collections.CARRIER)
        .find({ carrier_code: { $in: carrierCodes } as any })
        .toArray()
    : [];
  const carrierByCode = new Map<string, string>(
    carriers.map((c: any) => [
      c.carrier_code,
      c.display_name_zh_hk || c.display_name || c.carrier_code,
    ])
  );
  const out = new Map<string, string>();
  for (const a of accounts) {
    const label = carrierByCode.get(a.carrier_code) ?? a.carrier_code;
    out.set(String(a._id), label);
  }
  return out;
}

async function loadSavedAddresses(
  db: any,
  ids: (string | null | undefined)[]
): Promise<Map<string, any>> {
  const cleaned = Array.from(new Set(ids.filter(Boolean) as string[]));
  if (cleaned.length === 0) return new Map();
  const docs = await db
    .collection(collections.SAVED_ADDRESS)
    .find({ _id: { $in: cleaned } as any })
    .toArray();
  return new Map(docs.map((d: any) => [String(d._id), d]));
}

async function loadInboundDeclaredItems(
  db: any,
  inboundIds: string[]
): Promise<Map<string, { product_name: string; quantity: number; subtotal: number }[]>> {
  if (inboundIds.length === 0) return new Map();
  const items = await db
    .collection(collections.INBOUND_DECLARED_ITEM)
    .find({ inbound_request_id: { $in: inboundIds } as any })
    .toArray();
  const map = new Map<
    string,
    { product_name: string; quantity: number; subtotal: number }[]
  >();
  for (const it of items) {
    const arr = map.get(it.inbound_request_id) ?? [];
    arr.push({
      product_name: it.product_name,
      quantity: it.quantity,
      subtotal: it.subtotal ?? 0,
    });
    map.set(it.inbound_request_id, arr);
  }
  return map;
}

/* ============================================================
 * Stage 1 — 等待入庫
 * ==========================================================*/

export async function listWaitingInbound(
  client_id: string
): Promise<WaitingInboundRow[]> {
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.INBOUND)
    .find({ client_id, status: { $in: STATUS_WAITING_INBOUND } as any })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  const carrierLabels = await loadCarrierLabels(
    db,
    docs.map((d: any) => d.shipping_destination?.carrier_account_id)
  );
  const savedAddrs = await loadSavedAddresses(
    db,
    docs.map((d: any) => d.shipping_destination?.saved_address_id)
  );
  const itemsByInbound = await loadInboundDeclaredItems(
    db,
    docs.map((d: any) => String(d._id))
  );
  return docs.map((d: any) => {
    const receiver = d.shipping_destination?.receiver_address_snapshot;
    const savedAddr = savedAddrs.get(d.shipping_destination?.saved_address_id);
    const carrierLabel =
      carrierLabels.get(d.shipping_destination?.carrier_account_id ?? "") ??
      d.carrier_inbound_code ??
      "—";
    return {
      id: String(d._id),
      items: formatItems(itemsByInbound.get(String(d._id)) ?? []),
      sub: d.status === "arrived" ? "arrived" : "not_arrived",
      method: mapShippingMode(d.shipping_mode),
      recipient: formatRecipient(receiver, savedAddr),
      carrier: carrierLabel,
      time: fmtDateTime(d.createdAt),
    };
  });
}

/* ============================================================
 * Stage 2 — 已上架 (managed groups + manual pending)
 * ==========================================================*/

export async function listShelved(client_id: string): Promise<{
  managed: ConsolidationGroup[];
  manualPending: ManualPendingRow[];
}> {
  const db = await connectToDatabase();

  // ── managed: pending consolidation_groups ───────────────
  const groupDocs = await db
    .collection(collections.CONSOLIDATION_GROUP)
    .find({ client_id, status: "pending" })
    .sort({ createdAt: 1 })
    .toArray();

  const allForecastIds: string[] = groupDocs.flatMap(
    (g: any) => g.forecast_ids ?? []
  );
  const forecastInbounds = allForecastIds.length
    ? await db
        .collection(collections.INBOUND)
        .find({ _id: { $in: allForecastIds } as any })
        .toArray()
    : [];
  const inboundById = new Map(
    forecastInbounds.map((d: any) => [String(d._id), d])
  );
  const itemsByInbound = await loadInboundDeclaredItems(
    db,
    forecastInbounds.map((d: any) => String(d._id))
  );
  const savedAddrs = await loadSavedAddresses(
    db,
    groupDocs.map((g: any) => g.saved_address_id)
  );
  const carrierLabels = await loadCarrierLabels(
    db,
    groupDocs.map((g: any) => g.carrier_account_id)
  );

  // Need a sweep_due_ymd; use existing PendingGroupSummary helper indirectly.
  // For simplicity reuse the working-days addition from sweep helper if
  // available, otherwise approximate +3 calendar days.
  const managed: ConsolidationGroup[] = groupDocs.map((g: any) => {
    const items: ConsolidationGroupItem[] = (g.forecast_ids ?? []).map(
      (id: string) => {
        const inbound: any = inboundById.get(id);
        const declared = itemsByInbound.get(id) ?? [];
        const notArrived = !inbound?.receivedAt;
        return {
          id,
          items: inbound ? formatItems(declared) : id,
          price: formatPriceJpy(inbound?.declared_value_total ?? 0),
          vol: inbound?.size_estimate === "small"
            ? "小"
            : inbound?.size_estimate === "large"
            ? "大"
            : "中",
          time: notArrived ? undefined : fmtDateTime(inbound?.receivedAt),
          notArrived,
        };
      }
    );
    const shelved = items.filter((it) => !it.notArrived).length;
    const oldestReceivedAt: Date | null = g.oldest_received_at
      ? new Date(g.oldest_received_at)
      : null;
    const sweepDue = oldestReceivedAt
      ? new Date(oldestReceivedAt.getTime() + 3 * 86_400_000)
      : null;
    const savedAddr = savedAddrs.get(g.saved_address_id);
    const carrierLabel =
      carrierLabels.get(g.carrier_account_id) ?? "—";
    return {
      gid: String(g._id),
      recipient:
        savedAddr?.recipient_name
          ? `${savedAddr.recipient_name} · ${savedAddr.city ?? ""}`.trim()
          : "未設定",
      carrier: carrierLabel,
      total: items.length,
      shelved,
      oldestYmd: fmtYmd(oldestReceivedAt),
      sweepDueYmd: sweepDue
        ? `${sweepDue.getFullYear()}-${String(sweepDue.getMonth() + 1).padStart(2, "0")}-${String(sweepDue.getDate()).padStart(2, "0")}`
        : undefined,
      items,
    };
  });

  // ── manual pending: status=received, manual mode, no outbound ──
  const manualInbounds = await db
    .collection(collections.INBOUND)
    .find({
      client_id,
      status: "received",
      shipping_mode: "manual_consolidate",
    })
    .sort({ receivedAt: -1 })
    .limit(50)
    .toArray();

  // Filter out any inbound already linked to an outbound.
  const manualIds = manualInbounds.map((d: any) => String(d._id));
  const linkedRows = manualIds.length
    ? await db
        .collection(collections.OUTBOUND_INBOUND_LINK)
        .find({ inbound_request_id: { $in: manualIds } as any })
        .toArray()
    : [];
  const linkedSet = new Set(
    linkedRows.map((r: any) => r.inbound_request_id)
  );
  const stillPending = manualInbounds.filter(
    (d: any) => !linkedSet.has(String(d._id))
  );

  const manualItemsByInbound = await loadInboundDeclaredItems(
    db,
    stillPending.map((d: any) => String(d._id))
  );
  const manualSavedAddrs = await loadSavedAddresses(
    db,
    stillPending.map((d: any) => d.shipping_destination?.saved_address_id)
  );

  const manualPending: ManualPendingRow[] = stillPending.map((d: any) => ({
    id: String(d._id),
    items: formatItems(manualItemsByInbound.get(String(d._id)) ?? []),
    price: formatPriceJpy(d.declared_value_total),
    recipient: formatRecipient(
      d.shipping_destination?.receiver_address_snapshot,
      manualSavedAddrs.get(d.shipping_destination?.saved_address_id)
    ),
    time: fmtDateTime(d.receivedAt),
  }));

  return { managed, manualPending };
}

/* ============================================================
 * Stage 3 — 等待併箱 (outbound with inbound children)
 * ==========================================================*/

export async function listWaitingConsolidate(
  client_id: string
): Promise<ConsolidateOutbound[]> {
  const db = await connectToDatabase();
  const outbounds = await db
    .collection(collections.OUTBOUND)
    .find({ client_id, status: { $in: STATUS_WAITING_CONSOLIDATE } as any })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  if (outbounds.length === 0) return [];

  const outboundIds = outbounds.map((d: any) => String(d._id));
  const links = await db
    .collection(collections.OUTBOUND_INBOUND_LINK)
    .find({ outbound_id: { $in: outboundIds } as any })
    .toArray();
  const inboundIds = links.map((l: any) => l.inbound_request_id);
  const inbounds = inboundIds.length
    ? await db
        .collection(collections.INBOUND)
        .find({ _id: { $in: inboundIds } as any })
        .toArray()
    : [];
  const inboundById = new Map(inbounds.map((d: any) => [String(d._id), d]));
  const itemsByInbound = await loadInboundDeclaredItems(db, inboundIds);
  const carrierLabels = await loadCarrierLabels(
    db,
    outbounds.map((o: any) => o.carrier_account_id)
  );

  return outbounds.map((o: any) => {
    const myLinks = links.filter((l: any) => l.outbound_id === String(o._id));
    const children: ConsolidateOutboundChild[] = myLinks.map((l: any) => {
      const inbound: any = inboundById.get(l.inbound_request_id);
      return {
        id: l.inbound_request_id,
        items: formatItems(itemsByInbound.get(l.inbound_request_id) ?? []),
        price: formatPriceJpy(inbound?.declared_value_total ?? 0),
        time: fmtDateTime(inbound?.receivedAt ?? inbound?.createdAt),
      };
    });
    const value = children.reduce((sum, c) => {
      const n = parseInt(c.price.replace(/\D/g, ""), 10) || 0;
      return sum + n;
    }, 0);
    const isPicked = o.status === "picked";
    return {
      obid: String(o._id),
      total: children.length,
      value: `¥${value.toLocaleString()}`,
      recipient: formatRecipient(o.receiver_address, null),
      carrier:
        carrierLabels.get(o.carrier_account_id ?? "") ?? o.carrier_code ?? "—",
      sub: isPicked ? "picked" : "not_picked",
      subLabel: isPicked ? "已揀貨" : "未揀貨",
      subVariant: isPicked ? "ok" : "warn",
      time: fmtDateTime(o.createdAt),
      children,
    };
  });
}

/* ============================================================
 * Stage 4 / 5 — outbound + box sub-cards
 * ==========================================================*/

async function listOutboundWithBoxes(
  client_id: string,
  statuses: string[]
): Promise<OutboundCard[]> {
  const db = await connectToDatabase();
  const outbounds = await db
    .collection(collections.OUTBOUND)
    .find({ client_id, status: { $in: statuses } as any })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  if (outbounds.length === 0) return [];

  const outboundIds = outbounds.map((d: any) => String(d._id));
  const boxes = await db
    .collection(collections.OUTBOUND_BOX)
    .find({ outbound_id: { $in: outboundIds } as any })
    .sort({ box_no: 1 })
    .toArray();
  const boxIds = boxes.map((b: any) => String(b._id));

  const boxInboundLinks = boxIds.length
    ? await db
        .collection(collections.BOX_INBOUND_LINK)
        .find({ box_id: { $in: boxIds } as any })
        .toArray()
    : [];
  const inboundIds = Array.from(
    new Set(boxInboundLinks.map((l: any) => l.inbound_request_id))
  );
  const inbounds = inboundIds.length
    ? await db
        .collection(collections.INBOUND)
        .find({ _id: { $in: inboundIds } as any })
        .toArray()
    : [];
  const inboundById = new Map(inbounds.map((d: any) => [String(d._id), d]));
  const itemsByInbound = await loadInboundDeclaredItems(db, inboundIds);
  const carrierLabels = await loadCarrierLabels(
    db,
    outbounds.map((o: any) => o.carrier_account_id)
  );

  return outbounds.map((o: any) => {
    const myBoxes = boxes.filter((b: any) => b.outbound_id === String(o._id));
    const boxesOut: Box[] = myBoxes.map((b: any) => {
      const linksInBox = boxInboundLinks.filter(
        (l: any) => l.box_id === String(b._id)
      );
      const dim = b.dimensions
        ? `${b.dimensions.length}×${b.dimensions.width}×${b.dimensions.height} cm`
        : "—";
      const weight = b.weight_actual ? `${b.weight_actual.toFixed(2)} kg` : "—";
      const items: BoxItem[] = linksInBox.map((l: any) => {
        const inbound: any = inboundById.get(l.inbound_request_id);
        return {
          id: l.inbound_request_id,
          items: formatItems(itemsByInbound.get(l.inbound_request_id) ?? []),
          price: formatPriceJpy(inbound?.declared_value_total ?? 0),
        };
      });
      return {
        bid: String(b.box_no ?? b._id),
        dim,
        weight,
        items,
      };
    });
    const totalWeightKg = myBoxes.reduce(
      (s: number, b: any) => s + (b.weight_actual ?? 0),
      0
    );

    // Chip variants based on outbound + box status
    const chips: { label: string; variant: "warn" | "ok" | "info" | "idle" }[] =
      [];
    if (
      o.status === "weight_verified" ||
      o.status === "pending_client_label" ||
      o.status === "label_obtaining" ||
      o.status === "label_obtained" ||
      o.status === "label_printed"
    ) {
      chips.push({ label: "已秤重", variant: "ok" });
    }
    if (
      o.status === "label_obtained" ||
      o.status === "label_printed" ||
      o.status === "departed"
    ) {
      chips.push({ label: "已生成運單", variant: "ok" });
    } else if (
      o.status === "pending_client_label" ||
      o.status === "label_obtaining"
    ) {
      chips.push({ label: "等待運單生成", variant: "info" });
    } else if (o.status === "packing" || o.status === "packed") {
      chips.push({ label: "集箱中", variant: "info" });
    }
    if (chips.length === 0) chips.push({ label: o.status, variant: "idle" });

    return {
      obid: String(o._id),
      recipient: formatRecipient(o.receiver_address, null),
      carrier:
        carrierLabels.get(o.carrier_account_id ?? "") ?? o.carrier_code ?? "—",
      chips,
      totalWeight: `${totalWeightKg.toFixed(2)} kg`,
      boxCount: myBoxes.length,
      boxes: boxesOut,
    };
  });
}

export function listConsolidated(client_id: string) {
  return listOutboundWithBoxes(client_id, STATUS_CONSOLIDATED);
}

export async function listWaitingDispatch(
  client_id: string
): Promise<OutboundCard[]> {
  const cards = await listOutboundWithBoxes(
    client_id,
    STATUS_WAITING_DISPATCH
  );
  return cards.map((c) => ({
    ...c,
    pickupAt: "明日 09:00",
    chips: [{ label: "準備好", variant: "ok" as const }],
  }));
}

/* ============================================================
 * Stage 6 — 已出倉 (flat)
 * ==========================================================*/

export async function listDispatched(
  client_id: string,
  rangeDays = 30
): Promise<DispatchedRow[]> {
  const db = await connectToDatabase();
  const since = new Date(Date.now() - rangeDays * 86_400_000);
  const outbounds = await db
    .collection(collections.OUTBOUND)
    .find({
      client_id,
      status: { $in: STATUS_DISPATCHED } as any,
      departed_at: { $gte: since },
    })
    .sort({ departed_at: -1 })
    .limit(100)
    .toArray();
  if (outbounds.length === 0) return [];
  const carrierLabels = await loadCarrierLabels(
    db,
    outbounds.map((o: any) => o.carrier_account_id)
  );
  const outboundIds = outbounds.map((d: any) => String(d._id));
  const boxCounts = await db
    .collection(collections.OUTBOUND_BOX)
    .aggregate([
      { $match: { outbound_id: { $in: outboundIds } } },
      { $group: { _id: "$outbound_id", n: { $sum: 1 } } },
    ])
    .toArray();
  const boxCountByOb = new Map<string, number>(
    boxCounts.map((d: any) => [d._id, d.n])
  );

  return outbounds.map((o: any) => ({
    obid: String(o._id),
    cb: `${o.inbound_count ?? 0} 件 / ${boxCountByOb.get(String(o._id)) ?? 0} 箱`,
    value: formatPriceJpy(o.quoted_amount_hkd ?? 0),
    recipient: formatRecipient(o.receiver_address, null),
    carrier:
      carrierLabels.get(o.carrier_account_id ?? "") ?? o.carrier_code ?? "—",
    time: fmtDateTime(o.departed_at),
  }));
}

/* ============================================================
 * Pipeline counts
 * ==========================================================*/

export async function countShipments(
  client_id: string
): Promise<Record<ShipmentStageKey, number>> {
  const db = await connectToDatabase();
  const [
    waitingInbound,
    shelvedManagedGroups,
    shelvedManual,
    waitingConsolidate,
    consolidated,
    waitingDispatch,
    dispatched,
  ] = await Promise.all([
    db.collection(collections.INBOUND).countDocuments({
      client_id,
      status: { $in: STATUS_WAITING_INBOUND },
    }),
    db.collection(collections.CONSOLIDATION_GROUP).countDocuments({
      client_id,
      status: "pending",
    }),
    db.collection(collections.INBOUND).countDocuments({
      client_id,
      status: "received",
      shipping_mode: "manual_consolidate",
    }),
    db.collection(collections.OUTBOUND).countDocuments({
      client_id,
      status: { $in: STATUS_WAITING_CONSOLIDATE },
    }),
    db.collection(collections.OUTBOUND).countDocuments({
      client_id,
      status: { $in: STATUS_CONSOLIDATED },
    }),
    db.collection(collections.OUTBOUND).countDocuments({
      client_id,
      status: { $in: STATUS_WAITING_DISPATCH },
    }),
    db.collection(collections.OUTBOUND).countDocuments({
      client_id,
      status: { $in: STATUS_DISPATCHED },
      departed_at: { $gte: new Date(Date.now() - 30 * 86_400_000) },
    }),
  ]);
  return {
    waiting_inbound: waitingInbound,
    shelved: shelvedManagedGroups + shelvedManual,
    waiting_consolidate: waitingConsolidate,
    consolidated,
    waiting_dispatch: waitingDispatch,
    dispatched,
  };
}

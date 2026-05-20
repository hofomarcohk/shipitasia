// POST /api/wms/admin/fast-forward
//
// Demo-mode controller for advancing a shipment to its next state without
// scanning, batching, or hitting real carrier APIs. Writes the minimal Mongo
// state needed for the OMS overview page to reflect the next stage.
//
// Body:
//   { resource: "inbound" | "outbound" | "group", id: string }
//
// All writes are direct (no audit log / notification) — this endpoint is
// strictly for end-to-end demo flows. Requires admin / staff JWT.

import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

type Resource = "inbound" | "outbound" | "group";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    requireStaff(request);
    const resource = body?.resource as Resource | undefined;
    const id = body?.id as string | undefined;
    if (!resource || !id) {
      return { status: 400, message: "resource and id required" };
    }
    const db = await connectToDatabase();
    const now = new Date();
    let nextStatus = "";
    let extra: Record<string, unknown> = {};

    if (resource === "inbound") {
      const doc = await db.collection(collections.INBOUND).findOne({ _id: id as any });
      if (!doc) throw new ApiError("INBOUND_NOT_FOUND");
      if (doc.status === "pending") {
        nextStatus = "arrived";
        await db.collection(collections.INBOUND).updateOne(
          { _id: id as any },
          { $set: { status: "arrived", arrivedAt: now, updatedAt: now } }
        );
      } else if (doc.status === "arrived") {
        nextStatus = "received";
        await db.collection(collections.INBOUND).updateOne(
          { _id: id as any },
          { $set: { status: "received", receivedAt: now, updatedAt: now } }
        );
        // Assign mock shelf
        await db.collection(collections.ITEM_LOCATION).updateOne(
          { itemCode: id },
          {
            $set: {
              itemCode: id,
              warehouseCode: doc.warehouseCode,
              locationCode: "A001",
              client_id: doc.client_id,
              createdAt: now,
              updatedAt: now,
            },
          },
          { upsert: true }
        );
        // Managed: update group anchor; single_direct: auto-create outbound
        if (doc.shipping_mode === "managed_consign" && doc.consolidation_group_id) {
          await db
            .collection(collections.CONSOLIDATION_GROUP)
            .updateOne(
              { _id: doc.consolidation_group_id, oldest_received_at: null },
              { $set: { oldest_received_at: now, updatedAt: now } }
            );
        } else if (doc.shipping_mode === "single_direct" && doc.shipping_destination) {
          // Auto-create outbound at ready_for_label
          const obId = await nextOutboundId(db);
          await db.collection(collections.OUTBOUND).insertOne({
            _id: obId,
            client_id: doc.client_id,
            warehouseCode: doc.warehouseCode,
            shipment_type: "single",
            inbound_count: 1,
            carrier_code: "sf_express",
            carrier_account_id: doc.shipping_destination.carrier_account_id,
            service_code: "STANDARD",
            destination_country:
              doc.shipping_destination.receiver_address_snapshot.country_code,
            receiver_address: doc.shipping_destination.receiver_address_snapshot,
            processing_preference: "auto",
            status: "ready_for_label",
            held_reason: null, held_since: null, held_detail: null,
            declared_weight_kg: null, actual_weight_kg: null,
            actual_dimension: null, rate_quote: null,
            quoted_amount_hkd: null, label_url: null,
            label_obtained_at: null, tracking_no: null,
            departed_at: null, cancelled_at: null, cancel_reason: null,
            customer_remarks: null, batch_id: null,
            disallow_consolidation: false, cargo_categories: [],
            label_batch_id: null,
            createdAt: now, updatedAt: now,
          } as any);
          await db.collection(collections.OUTBOUND_INBOUND_LINK).insertOne({
            outbound_id: obId,
            inbound_request_id: id,
            createdAt: now,
          });
          extra.auto_created_outbound = obId;
        }
      } else {
        return {
          status: 400,
          message: `Inbound ${id} (status=${doc.status}) is past the receive stage; advance via the outbound it belongs to.`,
        };
      }
    } else if (resource === "group") {
      // Force-release the group → flips status, sweep cron emits outbound.
      // For demo we synthesise the outbound directly: status=force_released
      // on the group + create one outbound at ready_for_label aggregating
      // its forecast_ids that have receivedAt set.
      const group = await db.collection(collections.CONSOLIDATION_GROUP).findOne({ _id: id as any });
      if (!group) throw new ApiError("CONSOLIDATION_GROUP_NOT_FOUND");
      const forecastIds: string[] = group.forecast_ids ?? [];
      const shelved = await db
        .collection(collections.INBOUND)
        .find({ _id: { $in: forecastIds } as any, status: "received" })
        .toArray();
      if (shelved.length === 0) {
        return { status: 400, message: "No shelved items in this group yet." };
      }
      const obId = await nextOutboundId(db);
      const sample: any = shelved[0];
      await db.collection(collections.OUTBOUND).insertOne({
        _id: obId,
        client_id: group.client_id,
        warehouseCode: group.warehouseCode,
        shipment_type: "consolidated",
        inbound_count: shelved.length,
        carrier_code: "sf_express",
        carrier_account_id: group.carrier_account_id,
        service_code: "STANDARD",
        destination_country:
          sample.shipping_destination?.receiver_address_snapshot?.country_code ?? "HK",
        receiver_address: sample.shipping_destination?.receiver_address_snapshot,
        processing_preference: "auto",
        status: "ready_for_label",
        held_reason: null, held_since: null, held_detail: null,
        declared_weight_kg: null, actual_weight_kg: null,
        actual_dimension: null, rate_quote: null,
        quoted_amount_hkd: null, label_url: null,
        label_obtained_at: null, tracking_no: null,
        departed_at: null, cancelled_at: null, cancel_reason: null,
        customer_remarks: null, batch_id: null,
        disallow_consolidation: false, cargo_categories: [],
        label_batch_id: null,
        createdAt: now, updatedAt: now,
      } as any);
      await db.collection(collections.OUTBOUND_INBOUND_LINK).insertMany(
        shelved.map((ib: any) => ({
          outbound_id: obId,
          inbound_request_id: String(ib._id),
          createdAt: now,
        }))
      );
      await db.collection(collections.CONSOLIDATION_GROUP).updateOne(
        { _id: id as any },
        { $set: { status: "force_released", swept_at: now, swept_outbound_id: obId, updatedAt: now } }
      );
      nextStatus = "force_released";
      extra.outbound_id = obId;
    } else if (resource === "outbound") {
      const ob = await db.collection(collections.OUTBOUND).findOne({ _id: id as any });
      if (!ob) throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND");
      const cur = ob.status;
      // State machine
      if (cur === "ready_for_label" || cur === "picking") {
        nextStatus = "picked";
        await db.collection(collections.OUTBOUND).updateOne(
          { _id: id as any },
          { $set: { status: "picked", updatedAt: now } }
        );
      } else if (cur === "picked" || cur === "packing") {
        nextStatus = "packed";
        // Ensure at least 1 box exists
        const boxCount = await db.collection(collections.OUTBOUND_BOX).countDocuments({ outbound_id: id });
        if (boxCount === 0) {
          const links = await db.collection(collections.OUTBOUND_INBOUND_LINK)
            .find({ outbound_id: id }).toArray();
          const boxId = `BX-${id}-001`;
          await db.collection(collections.OUTBOUND_BOX).insertOne({
            _id: boxId,
            outbound_id: id,
            box_no: "BX-001",
            dimensions: { length: 30, width: 25, height: 20 },
            weight_actual: null,
            status: "packed",
            createdAt: now,
            updatedAt: now,
          } as any);
          if (links.length > 0) {
            await db.collection(collections.BOX_INBOUND_LINK).insertMany(
              links.map((l: any) => ({
                box_id: boxId,
                inbound_request_id: l.inbound_request_id,
                createdAt: now,
              }))
            );
          }
        }
        await db.collection(collections.OUTBOUND).updateOne(
          { _id: id as any },
          { $set: { status: "packed", updatedAt: now } }
        );
      } else if (cur === "packed" || cur === "weighing") {
        nextStatus = "weight_verified";
        const boxes = await db.collection(collections.OUTBOUND_BOX)
          .find({ outbound_id: id }).toArray();
        // Mock weigh: 2.4kg per box if not set
        for (const b of boxes) {
          if (!b.weight_actual) {
            await db.collection(collections.OUTBOUND_BOX).updateOne(
              { _id: b._id },
              { $set: { weight_actual: 2.4, status: "weighed", updatedAt: now } }
            );
          }
        }
        const total = boxes.reduce((s: number, b: any) => s + (b.weight_actual ?? 2.4), 0);
        await db.collection(collections.OUTBOUND).updateOne(
          { _id: id as any },
          { $set: { status: "weight_verified", actual_weight_kg: total, updatedAt: now } }
        );
      } else if (cur === "weight_verified" || cur === "pending_client_label" || cur === "label_obtaining") {
        nextStatus = "label_obtained";
        const boxes = await db.collection(collections.OUTBOUND_BOX)
          .find({ outbound_id: id }).toArray();
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          await db.collection(collections.OUTBOUND_BOX).updateOne(
            { _id: b._id },
            {
              $set: {
                status: "label_obtained",
                tracking_no_carrier: `MOCK${id.replace(/[^0-9]/g, "")}${String(i + 1).padStart(2, "0")}`,
                label_pdf_path: `/mock-labels/${b._id}.pdf`,
                label_obtained_at: now,
                updatedAt: now,
              },
            }
          );
        }
        await db.collection(collections.OUTBOUND).updateOne(
          { _id: id as any },
          {
            $set: {
              status: "label_obtained",
              label_obtained_at: now,
              tracking_no: `MOCK${id.replace(/[^0-9]/g, "")}`,
              label_url: `/mock-labels/${id}.pdf`,
              updatedAt: now,
            },
          }
        );
      } else if (cur === "label_obtained") {
        nextStatus = "label_printed";
        await db.collection(collections.OUTBOUND).updateOne(
          { _id: id as any },
          { $set: { status: "label_printed", updatedAt: now } }
        );
      } else if (cur === "label_printed") {
        nextStatus = "departed";
        const boxes = await db.collection(collections.OUTBOUND_BOX)
          .find({ outbound_id: id }).toArray();
        for (const b of boxes) {
          await db.collection(collections.OUTBOUND_BOX).updateOne(
            { _id: b._id },
            { $set: { status: "departed", departed_at: now, updatedAt: now } }
          );
        }
        await db.collection(collections.OUTBOUND).updateOne(
          { _id: id as any },
          { $set: { status: "departed", departed_at: now, updatedAt: now } }
        );
      } else if (cur === "departed") {
        return { status: 400, message: `Outbound ${id} already departed.` };
      } else {
        return { status: 400, message: `Unknown / unsupported outbound status: ${cur}` };
      }
    }

    return {
      status: 200,
      message: "Advanced",
      data: { resource, id, nextStatus, ...extra },
    };
  });
}

async function nextOutboundId(db: any): Promise<string> {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const key = `O_${yyyy}${mm}${dd}`;
  const res = await db.collection(collections.DAILY_COUNTER).findOneAndUpdate(
    { _id: key },
    { $inc: { counter: 1 }, $set: { last_used_at: new Date() } },
    { upsert: true, returnDocument: "after" }
  );
  const doc = res?.value ?? res;
  const counter = doc?.counter ?? 1;
  return `O-${yyyy}${mm}${dd}-${String(counter).padStart(4, "0")}`;
}

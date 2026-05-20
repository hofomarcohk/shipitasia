// GET /api/wms/admin/fast-forward/state?client_id=<id>
//
// Returns the demo-fast-forward dashboard's row data for a given client:
// every in-flight inbound + consolidation_group + outbound with current
// status. Admin/staff JWT required.

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireStaff(request);
    const sp = new URL(request.url).searchParams;
    const client_id = sp.get("client_id") ?? "";
    if (!client_id) {
      return { status: 400, message: "client_id required" };
    }
    const db = await connectToDatabase();
    const [client, inbounds, groups, outbounds] = await Promise.all([
      db.collection(collections.CLIENT).findOne({ _id: client_id as any }),
      db
        .collection(collections.INBOUND)
        .find({
          client_id,
          status: { $in: ["pending", "arrived", "received"] },
        })
        .project({
          _id: 1,
          status: 1,
          shipping_mode: 1,
          tracking_no: 1,
          consolidation_group_id: 1,
          receivedAt: 1,
          createdAt: 1,
        })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray(),
      db
        .collection(collections.CONSOLIDATION_GROUP)
        .find({ client_id, status: "pending" })
        .project({ _id: 1, status: 1, forecast_ids: 1, oldest_received_at: 1 })
        .sort({ createdAt: 1 })
        .toArray(),
      db
        .collection(collections.OUTBOUND)
        .find({
          client_id,
          status: {
            $nin: ["cancelled", "cancelled_after_label"],
          },
        })
        .project({
          _id: 1,
          status: 1,
          inbound_count: 1,
          carrier_code: 1,
          shipment_type: 1,
          actual_weight_kg: 1,
          tracking_no: 1,
          departed_at: 1,
          createdAt: 1,
        })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray(),
    ]);
    return {
      status: 200,
      message: "Success",
      data: {
        client: client
          ? {
              _id: String(client._id),
              code: client.code,
              email: client.email,
              company_name: client.company_name,
            }
          : null,
        inbounds: inbounds.map((d: any) => ({
          _id: String(d._id),
          status: d.status,
          shipping_mode: d.shipping_mode,
          tracking_no: d.tracking_no,
          consolidation_group_id: d.consolidation_group_id ?? null,
          receivedAt: d.receivedAt ?? null,
          createdAt: d.createdAt,
        })),
        groups: groups.map((d: any) => ({
          _id: String(d._id),
          status: d.status,
          forecast_count: (d.forecast_ids ?? []).length,
          oldest_received_at: d.oldest_received_at ?? null,
        })),
        outbounds: outbounds.map((d: any) => ({
          _id: String(d._id),
          status: d.status,
          inbound_count: d.inbound_count ?? 0,
          carrier_code: d.carrier_code,
          shipment_type: d.shipment_type,
          actual_weight_kg: d.actual_weight_kg ?? null,
          tracking_no: d.tracking_no ?? null,
          departed_at: d.departed_at ?? null,
          createdAt: d.createdAt,
        })),
      },
    };
  });
}

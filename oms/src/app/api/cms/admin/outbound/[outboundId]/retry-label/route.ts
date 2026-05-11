import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { connectToDatabase } from "@/lib/mongo";
import { collections } from "@/cst/collections";
import { fetchLabelMultiBox } from "@/services/outbound/wmsFlow";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { logAudit } from "@/services/audit/log";
import { ApiReturn } from "@/types/Api";
import { ApiError } from "@/app/api/api-error";
import { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ outboundId: string }> }
) {
  const { outboundId } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const actor = requireAdmin(request);
    // Admin retry can run on any held(label_failed_retry / carrier_*) state.
    // Move the outbound back to pending_client_label so fetchLabelMultiBox
    // can claim it.
    const db = await connectToDatabase();
    const ob = await db
      .collection(collections.OUTBOUND)
      .findOne({ _id: outboundId as any });
    if (!ob) throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outboundId });
    if (ob.status === "held") {
      await db.collection(collections.OUTBOUND).updateOne(
        { _id: outboundId as any, status: "held" },
        {
          $set: {
            status: "pending_client_label",
            held_reason: null,
            held_since: null,
            held_detail: null,
            updatedAt: new Date(),
          },
        }
      );
    }
    await logAudit({
      action: AUDIT_ACTIONS.outbound_admin_retry_label,
      actor_type: AUDIT_ACTOR_TYPES.admin,
      actor_id: actor.staff_id,
      target_type: AUDIT_TARGET_TYPES.outbound,
      target_id: outboundId,
      details: { previous_status: ob.status, previous_held_reason: ob.held_reason ?? null },
      ip_address: actor.ip_address,
      user_agent: actor.user_agent,
    });
    const data = await fetchLabelMultiBox(outboundId, "admin", actor.staff_id);
    return { status: 200, message: "Retry triggered", data };
  });
}

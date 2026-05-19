// P17 dev helper — simulate the post-weigh-verified P17 trigger block on
// an already-staged outbound. Useful for testing solo + auto-batch label
// fetch without walking through the full WMS pick→pack→weigh path. Dev-
// only; production gated by CRON_TRIGGER_SECRET like the sweep endpoint.

import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";
import { apiMiddleware } from "../../api-middleware";
import { connectToDatabase } from "@/lib/mongo";
import { collections } from "@/cst/collections";
import { ApiError } from "@/app/api/api-error";
import {
  autoBatchFetchLabels,
  findLabelBatchSiblings,
  fetchLabelMultiBox,
} from "@/services/outbound/wmsFlow";

function authorize(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") return;
  const expected = process.env.CRON_TRIGGER_SECRET;
  if (!expected) throw new ApiError("FORBIDDEN");
  const got = req.headers.get("x-cron-trigger-secret") ?? "";
  if (got !== expected) throw new ApiError("FORBIDDEN");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ outboundId: string }> }
) {
  return apiMiddleware(request, null, async (): Promise<ApiReturn> => {
    authorize(request);
    const { outboundId } = await context.params;
    const db = await connectToDatabase();
    const ob = await db
      .collection(collections.OUTBOUND)
      .findOne({ _id: outboundId as any });
    if (!ob) throw new ApiError("OUTBOUND_REQUEST_NOT_FOUND", { orderId: outboundId });
    if (ob.status !== "weight_verified") {
      return {
        status: 400,
        message: `Outbound not at weight_verified (currently ${ob.status})`,
        data: { current_status: ob.status },
      };
    }
    const siblings = await findLabelBatchSiblings(db, outboundId);
    if (siblings.length > 0) {
      await autoBatchFetchLabels([outboundId, ...siblings]);
      return {
        status: 200,
        message: "Batch label fetch triggered",
        data: {
          mode: "batch",
          outbound_ids: [outboundId, ...siblings],
        },
      };
    }
    await fetchLabelMultiBox(outboundId, "system", null);
    return {
      status: 200,
      message: "Solo label fetch triggered",
      data: { mode: "solo", outbound_id: outboundId },
    };
  });
}

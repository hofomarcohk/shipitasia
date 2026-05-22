// W4 — POST /api/wms/outbound/[outboundId]/retry-label-fetch
//
// Warehouse-staff entry point used by the print page when a box's
// carrier label fetch previously failed (box.label_url === null on a
// group that's otherwise at status `label_obtained`). Independent from
// the admin retry-label endpoint:
//   - admin retry resets outbound.status to pending_client_label and
//     re-runs fetchLabelMultiBox across every box.
//   - this endpoint targets the next still-failed box only and never
//     touches outbound.status, so a partial-success outbound can crawl
//     to fully-labelled by repeated UI clicks without losing the
//     already-fetched labels on its sibling boxes.

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "../../_helpers/route-util";
import { retryFetchLabelForOutbound } from "@/services/outbound/wmsFlow";
import { ApiReturn } from "@/types/Api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ outboundId: string }> }
) {
  const { outboundId } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const principal = requireWmsStaff(request);
    const result = await retryFetchLabelForOutbound(
      outboundId,
      principal.staff_id
    );
    return {
      status: 200,
      message:
        result.status === "success"
          ? "Label retry succeeded"
          : result.status === "no_failed_boxes"
            ? "Nothing to retry"
            : "Label retry failed",
      data: {
        status: result.status,
        label_url: result.label_url,
        attempt_count: result.attempt_count,
        last_fetch_error: result.last_fetch_error,
        retried_box_no: result.retried_box_no,
      },
    };
  });
}

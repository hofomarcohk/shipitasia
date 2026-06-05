// W5 — POST /api/wms/print/retry-group
//
// Group-level label retry. Takes outbound_ids[] and calls
// fetchLabelMultiBox for each one. Returns per-outbound results
// so the UI can show which succeeded and which still failed.

import { NextRequest } from "next/server";

import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "@/app/api/wms/outbound/_helpers/route-util";
import { fetchLabelMultiBox } from "@/services/outbound/wmsFlow";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { ApiReturn } from "@/types/Api";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    requireWmsStaff(request);
    const outbound_ids: string[] = body?.outbound_ids ?? [];
    if (outbound_ids.length === 0) {
      return { status: 400, message: "outbound_ids required" };
    }
    const results: {
      outbound_id: string;
      status: "success" | "failed";
      error?: string;
    }[] = [];
    const db = await connectToDatabase();
    for (const oid of outbound_ids) {
      try {
        await fetchLabelMultiBox(oid, "wms_staff" as any, null);
        // W5: auto-advance to label_printed so the order goes straight
        // to depart page (label PDF already opened for printing).
        await db.collection(collections.OUTBOUND).updateOne(
          { _id: oid as any, status: "label_obtained" },
          { $set: { status: "label_printed", updatedAt: new Date() } }
        );
        results.push({ outbound_id: oid, status: "success" });
      } catch (e: any) {
        results.push({
          outbound_id: oid,
          status: "failed",
          error: e?.message ?? String(e),
        });
      }
    }
    const allOk = results.every((r) => r.status === "success");
    return {
      status: 200,
      message: allOk
        ? `${results.length} 張出庫單全部取單成功`
        : `${results.filter((r) => r.status === "success").length}/${results.length} 成功`,
      data: { results, all_success: allOk },
    };
  });
}

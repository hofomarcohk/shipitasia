// W5 — POST /api/wms/print/advance-to-printed
//
// Advances label_obtained outbounds to label_printed so they appear
// on the depart page instead of the print page. Called after the label
// PDF has been opened for printing (either from weigh complete or
// from print-page retry success).

import { NextRequest } from "next/server";

import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireWmsStaff } from "@/app/api/wms/outbound/_helpers/route-util";
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
    const db = await connectToDatabase();
    const result = await db.collection(collections.OUTBOUND).updateMany(
      {
        _id: { $in: outbound_ids as any },
        status: "label_obtained",
      },
      { $set: { status: "label_printed", updatedAt: new Date() } }
    );
    return {
      status: 200,
      message: `${result.modifiedCount} 張出庫單已推進到離站等候`,
      data: { modified: result.modifiedCount },
    };
  });
}

import { cmsMiddleware, getCmsToken } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import {
  getOmsBadgeCounts,
  getWmsBadgeCounts,
} from "@/services/menu/get_badge_counts";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const ctxParam =
      new URL(request.url).searchParams.get("context") ?? "oms";
    if (ctxParam === "wms") {
      const staff = requireStaff(request);
      const data = await getWmsBadgeCounts(staff.warehouseCode);
      return { status: 200, message: "Success", data };
    }
    if (ctxParam === "pda") {
      // PDA tabs are hardcoded; no badges yet.
      return { status: 200, message: "Success", data: {} };
    }
    // OMS — pull client_id from token
    const token = getCmsToken(request);
    if (!token) return { status: 200, message: "Success", data: {} };
    const secret = process.env.CMS_SECRET || "";
    let payload: any;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return { status: 200, message: "Success", data: {} };
    }
    const client_id = String(payload?.clientId ?? "");
    if (!client_id) return { status: 200, message: "Success", data: {} };
    const data = await getOmsBadgeCounts(client_id);
    return { status: 200, message: "Success", data };
  });
}

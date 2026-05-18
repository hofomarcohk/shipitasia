import { cmsMiddleware, getCmsToken } from "@/app/api/cms/cms-middleware";
import { clientConfirmLabelBatch } from "@/services/outbound/wmsFlow";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { z } from "zod";

const BodySchema = z
  .object({
    outbound_ids: z.string().min(1).array().min(2).max(50),
  })
  .strict();

export async function POST(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const token = getCmsToken(request);
    if (!token) return { status: 401, message: "Unauthorized" };
    const secret = process.env.CMS_SECRET || "";
    let payload: any;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return { status: 401, message: "Unauthorized" };
    }
    const client_id = String(payload?.clientId ?? "");
    if (!client_id) return { status: 401, message: "Unauthorized" };

    const body = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return { status: 400, message: parsed.error.message };
    }
    const data = await clientConfirmLabelBatch(client_id, parsed.data.outbound_ids);
    return { status: 200, message: "Label batch obtained", data };
  });
}

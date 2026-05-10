import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import {
  listMyTopupRequests,
  submitTopupRequest,
  type ProofFileInput,
} from "@/services/wallet/topup-requests";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

function clientIdFromJwt(req: NextRequest): string {
  const token = getCmsToken(req);
  const payload = jwt.verify(
    token,
    process.env.CMS_SECRET || ""
  ) as jwt.JwtPayload;
  const clientId = payload.clientId as string | undefined;
  if (!clientId) throw new Error("UNAUTHORIZED: token missing clientId");
  return clientId;
}

function ipOf(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const list = await listMyTopupRequests({ client_id });
    return { status: 200, message: "Success", data: list };
  });
}

// multipart/form-data: amount, transfer_date, transfer_account_last4?,
// customer_note?, proof_file (binary).
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const fields: Record<string, string> = {};
  let file: ProofFileInput | null = null;

  for (const [k, v] of form.entries()) {
    if (typeof v === "string") {
      fields[k] = v;
    } else if (k === "proof_file") {
      const buffer = Buffer.from(await v.arrayBuffer());
      file = {
        buffer,
        size: v.size,
        mime: v.type || "application/octet-stream",
        original_name: v.name || "upload",
      };
    }
  }

  // For audit logging (cms-middleware uses body to record incoming logs),
  // synthesise a sanitised body that excludes the binary blob.
  const safeBody = {
    ...fields,
    proof_file: file ? `[binary ${file.size} bytes]` : null,
  };

  return cmsMiddleware(request, safeBody as any, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const result = await submitTopupRequest(fields, file, {
      client_id,
      ip_address: ipOf(request),
      user_agent: request.headers.get("user-agent") ?? undefined,
    });
    return { status: 200, message: "Submitted", data: result };
  });
}

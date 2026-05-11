import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { adminGetOutbound } from "@/services/outbound/outbound-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ outboundId: string }> }
) {
  const { outboundId } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireAdmin(request);
    const data = await adminGetOutbound(outboundId);
    return { status: 200, message: "Success", data };
  });
}

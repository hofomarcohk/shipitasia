import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { adminReleaseHeld } from "@/services/outbound/outbound-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ outboundId: string }> }
) {
  const { outboundId } = await params;
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const actor = requireAdmin(request);
    const data = await adminReleaseHeld(outboundId, actor, body);
    return { status: 200, message: "Released", data };
  });
}

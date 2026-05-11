import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { adminAbandonInbound } from "@/services/inbound/inbound-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const principal = requireAdmin(request);
    const data = await adminAbandonInbound(id, body, principal);
    return { status: 200, message: "Abandoned", data };
  });
}

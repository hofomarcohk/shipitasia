import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { adminGetInbound } from "@/services/inbound/inbound-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireAdmin(request);
    const data = await adminGetInbound(id);
    return { status: 200, message: "Success", data };
  });
}

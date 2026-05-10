import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { toggleClientStatus } from "@/services/admin/clients";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const principal = requireAdmin(request);
    const client = await toggleClientStatus(id, body, principal);
    return { status: 200, message: "Success", data: client };
  });
}

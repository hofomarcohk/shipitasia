import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { generatePasswordResetLink } from "@/services/admin/clients";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const principal = requireAdmin(request);
    const result = await generatePasswordResetLink(id, principal);
    return {
      status: 200,
      message: "Reset link generated; copy and send to the client",
      data: result,
    };
  });
}

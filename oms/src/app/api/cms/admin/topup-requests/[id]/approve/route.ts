import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { adminApproveTopup } from "@/services/wallet/topup-requests";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const principal = requireAdmin(request);
    const doc = await adminApproveTopup(id, principal);
    return { status: 200, message: "Approved", data: doc };
  });
}

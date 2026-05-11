import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { matchExistingInbound } from "@/services/unclaimed/unclaimed-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireStaff(request);
    const data = await matchExistingInbound(id);
    return { status: 200, message: "Success", data };
  });
}

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { cancelAssignment } from "@/services/unclaimed/unclaimed-service";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const principal = requireStaff(request);
    const data = await cancelAssignment(id, principal);
    return { status: 200, message: "Cancelled", data };
  });
}

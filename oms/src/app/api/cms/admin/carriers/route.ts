import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import {
  adminCreateCarrier,
  adminListCarriers,
} from "@/services/carrier/carriers";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireAdmin(request);
    const carriers = await adminListCarriers();
    return { status: 200, message: "Success", data: carriers };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const principal = requireAdmin(request);
    const carrier = await adminCreateCarrier(body, principal);
    return { status: 200, message: "Success", data: carrier };
  });
}

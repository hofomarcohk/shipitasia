import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { listActiveCarriers } from "@/services/carrier/carriers";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

// Public: any authenticated client gets the dropdown list. Returns only
// active carriers + the safe public projection (no oauth_config etc).
export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const carriers = await listActiveCarriers();
    return { status: 200, message: "Success", data: carriers };
  });
}

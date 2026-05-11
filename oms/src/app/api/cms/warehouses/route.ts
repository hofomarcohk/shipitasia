import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { listActiveWarehouses } from "@/services/inbound/master-data";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const data = await listActiveWarehouses();
    return { status: 200, message: "Success", data };
  });
}

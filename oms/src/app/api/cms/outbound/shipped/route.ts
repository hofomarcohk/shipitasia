import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { listShippedOutbounds } from "@/services/outbound/shipped";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

function clientIdFromJwt(req: NextRequest): string {
  const token = getCmsToken(req);
  const payload = jwt.verify(
    token,
    process.env.CMS_SECRET || ""
  ) as jwt.JwtPayload;
  return (payload as any).clientId as string;
}

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const sp = new URL(request.url).searchParams;
    const data = await listShippedOutbounds({
      client_id,
      search: sp.get("search") ?? undefined,
      country_codes: parseCsv(sp.get("country_codes")),
      carrier_codes: parseCsv(sp.get("carrier_codes")),
      departed_from: sp.get("departed_from")
        ? new Date(sp.get("departed_from")!)
        : undefined,
      departed_to: sp.get("departed_to")
        ? new Date(sp.get("departed_to")!)
        : undefined,
      sort_by: (sp.get("sort_by") as any) ?? undefined,
      sort_order: (sp.get("sort_order") as any) ?? undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : undefined,
      page_size: sp.get("page_size")
        ? parseInt(sp.get("page_size")!, 10)
        : undefined,
    });
    return { status: 200, message: "Success", data };
  });
}

function parseCsv(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

import { getParam } from "@/app/api/api-helper";
import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import {
  createSavedItem,
  listSavedItems,
} from "@/services/saved-items/saved-item-service";
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
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const category_id = url.searchParams.get("category_id") ?? undefined;
    const sortRaw = url.searchParams.get("sort") ?? undefined;
    const sort =
      sortRaw === "used" || sortRaw === "name" || sortRaw === "recent"
        ? sortRaw
        : undefined;
    const data = await listSavedItems(client_id, {
      search,
      category_id,
      sort,
    });
    return { status: 200, message: "Success", data };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const data = await createSavedItem(client_id, body);
    return { status: 200, message: "Created", data };
  });
}

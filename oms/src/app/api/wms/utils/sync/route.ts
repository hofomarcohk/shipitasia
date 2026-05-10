import { getParam } from "@/app/api/api-helper";
import { wmsMiddleware } from "@/app/api/wms/wms-middleware";
import { mongoAdds, mongoEdit } from "@/services/utils/mongodb";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return wmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const { collection, docs } = body;
    await mongoAdds(collection, docs);
    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return wmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const { collection, filter, update } = body;
    await mongoEdit(collection, filter, { $set: update });
    return {
      status: 200,
      message: "Success",
    };
  });
}

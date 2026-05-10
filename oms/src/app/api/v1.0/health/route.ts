import { getParam } from "@/app/api/api-helper";
import { apiMiddleware } from "@/app/api/v1.0/api-middleware";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);

  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);

  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function PUT(request: NextRequest) {
  const body = await getParam(request);

  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function DELETE(request: NextRequest) {
  const body = await getParam(request);

  return apiMiddleware(request, body, async (): Promise<ApiReturn> => {
    return {
      status: 200,
      message: "Success",
    };
  });
}

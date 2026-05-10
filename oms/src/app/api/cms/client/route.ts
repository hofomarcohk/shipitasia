import { ApiError } from "@/app/api/api-error";
import { formRules, getParam, validateParams } from "@/app/api/api-helper";
import {
  cmsMiddleware,
  getUser,
  validateRole,
} from "@/app/api/cms/cms-middleware";
import { createClient } from "@/services/clients/do_create_client";
import { editClient } from "@/services/clients/do_update_client";
import { ApiReturn } from "@/types/Api";
import { Client } from "@/types/Client";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  const langCode = request.headers.get("lang") || "en";
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    // validate role
    await validateRole(request, ["admin"]);

    const user = await getUser(request);
    if (user.username !== body.username) {
      if (user.role !== "admin") {
        throw new ApiError("FORBIDDEN");
      }
    }
    delete body.role;
    delete body.status;
    delete body.createdAt;

    // validate body
    validateClientEdit(body, langCode);

    // create client
    const client = await editClient(body);

    return {
      status: 200,
      message: "Success",
      data: client,
    };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  const langCode = request.headers.get("lang") || "en";
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    // validate role
    await validateRole(request, ["admin"]);

    // validate body
    validateClient(body, langCode);
    // create client
    const client = await createClient(body);

    return {
      status: 200,
      message: "Success",
      data: client,
    };
  });
}

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  const langCode = request.headers.get("lang") || "en";
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    // validate role
    await validateRole(request, ["admin"]);

    delete body.role;
    delete body.status;
    delete body.createdAt;

    // validate body
    validateClientEdit(body, langCode);

    // create client
    const client = await editClient(body);

    return {
      status: 200,
      message: "Success",
      data: client,
    };
  });
}

function validateClient(params: Client, langCode: string) {
  validateParams(
    params,
    {
      ...formRules(
        {
          username: { text: "client.username" },
          password: { text: "client.password" },
          firstName: { text: "client.firstName" },
          lastName: { text: "client.lastName" },
          company: { text: "client.company" },
        },
        {
          required: true,
          type: "string",
        }
      ),
      email: { text: "client.email", type: "email", required: true },
    },
    langCode
  );
}

function validateClientEdit(params: Client, langCode: string) {
  validateParams(
    params,
    {
      username: { text: "client.username", type: "string", required: true },
      email: { text: "client.email", type: "email" },
    },
    langCode
  );
}

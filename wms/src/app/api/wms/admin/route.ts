import {
  formRules,
  getParam,
  matchBuilder,
  sortBuilder,
  validateParams,
} from "@/app/api/api-helper";
import { cmsMiddleware, validateRole } from "@/app/api/wms/cms-middleware";
import { createAdmin } from "@/services/admin/do_create_admin";
import { editClient } from "@/services/admin/do_update_admin";
import { countAdmin, getAdminList } from "@/services/admin/get_admin_list";
import { Admin } from "@/types/Admin";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    await validateRole(request, ["admin"]);
    const { pageSize, pageNo, ...filter } = param;
    const sort = sortBuilder(param, ["updatedAt"]);
    const match = {
      ...matchBuilder(param, {
        search: {
          type: "search",
          field: ["username"],
        },
      }),
      deletedAt: { $exists: false },
    };

    let count = await countAdmin(match);
    let results = await getAdminList(match, sort, pageNo, pageSize);

    return {
      status: 200,
      message: "Success",
      data: { count, results },
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
    validateAdmin(body, langCode);
    // create client
    // create client
    const isActive = body.isActive;
    delete body.isActive;

    const admin = await createAdmin({
      ...body,
      status: isActive ? "active" : "inactive",
    });

    return {
      status: 200,
      message: "Success",
      data: admin,
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

    const isActive = body.isActive;
    delete body.isActive;

    // validate body
    validateAdminEdit(body, langCode);

    // create client
    const client = await editClient({
      ...body,
      status: isActive ? "active" : "inactive",
    });

    return {
      status: 200,
      message: "Success",
      data: client,
    };
  });
}

function validateAdmin(params: Admin, langCode: string) {
  validateParams(
    params,
    {
      ...formRules(
        {
          username: { text: "admin.username" },
          password: { text: "admin.password" },
          firstName: { text: "admin.firstName" },
          lastName: { text: "admin.lastName" },
        },
        { required: true, type: "string" }
      ),
    },
    langCode
  );
}

function validateAdminEdit(params: Admin, langCode: string) {
  validateParams(
    params,
    {
      username: { text: "admin.username", type: "string", required: true },
    },
    langCode
  );
}

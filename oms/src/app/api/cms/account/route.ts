import { ApiError } from "@/app/api/api-error";
import {
  formRules,
  getLang,
  getParam,
  validateParams,
} from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/cms/cms-middleware";
import { lang } from "@/lang/base";
import { createClient } from "@/services/clients/do_create_client";
import { editClient } from "@/services/clients/do_update_client";
import { newApiToken } from "@/services/login/auth";
import { redisDel, redisGet, redisSet } from "@/services/utils/redis";
import { ApiReturn } from "@/types/Api";
import { Client } from "@/types/Client";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    const langCode = await getLang(request);

    // validate role
    const user = await getUser(request);
    // console.log({ user });
    await redisDel("client.user", user.username);
    user.is_api_enabled = user?.apiTokens?.length ?? 0 > 0;

    delete user.password;
    if (user?.apiTokens?.length > 0) {
      const secret = await redisGet("client.secret", user.username);
      delete user.apiTokens[0].secretKey;
      user.apiTokens[0].secret = secret;
    }
    user.addresses = user.addresses?.map((address: any) => {
      if (langCode == "en") {
        address.fullAddress = [
          address.address + " " + address.zip,
          address.district,
          address.state,
          address.region,
          address.city,
        ]
          .map((item: any) => item?.trim())
          .filter((item: any) => item !== "")
          .join(", ");
      } else {
        address.fullAddress = [
          address.region,
          address.state,
          address.city,
          address.district,
          address.zip,
          address.address,
        ]
          .map((item: any) => item?.trim())
          .filter((item: any) => item !== "")
          .join(" ");
      }
      return address;
    });
    user.username = (user.username[0] ?? "") + "*****"; // mask username
    return {
      status: 200,
      message: lang("utils.success", langCode),
      data: user,
    };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  const langCode = request.headers.get("lang") || "en";
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
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
  const langCode = await getLang(request);

  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    // validate role
    const user = await getUser(request);
    if (user.username !== body.username) {
      if (user.role !== "admin") {
        throw new ApiError("FORBIDDEN");
      }
    }

    // currentPassword
    // newPassword
    // confirmPassword

    delete body.role;
    delete body.status;
    delete body.createdAt;
    delete body.username;

    let activeToken: { [key: string]: boolean } = {};
    body.externalTokens.forEach((token: any) => {
      if (token.isActive && activeToken[token.platform]) {
        throw new ApiError("MULTIPLE_ACTIVE_EXTERNAL_TOKEN_IN_PLATFORM");
      }
      if (token.isActive) {
        activeToken[token.platform] = true;
      }
    });
    const username = user.username;
    let data: any = {
      username,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      avatar: body.avatar,
      addresses: body.addresses
        ? body.addresses.map((address: any) => {
            if (!address.id) {
              address.id = randomUUID().slice(0, 6);
            }
            delete address.fullAddress;
            return address;
          })
        : [],
      payments: body.payments ?? [],
      externalTokens:
        body.externalTokens?.map((token: any) => ({
          ...token,
          ...(token.expiredAt ? { expiredAt: new Date(token.expiredAt) } : {}),
        })) ?? [],
      notifyApis: body.notifyApis ?? [],
    };
    console.log({ useraa: user._id });
    if (body.externalTokens) {
      await redisDel("YUN_API_TOKEN", user._id);
    }

    if (body.is_passwordChange) {
      if (body.currentPassword && body.newPassword && body.confirmPassword) {
        if (body.newPassword !== body.confirmPassword) {
          throw new ApiError("NEW_PASSWORD_NOT_MATCH");
        }
        const isMatch = await bcrypt.compare(
          body.currentPassword,
          user.password
        );
        if (!isMatch) {
          throw new ApiError("CURRENT_PASSWORD_NOT_MATCH");
        }

        data.password = body.newPassword;
      }
    }

    if (!body.is_api_enabled) {
      data.apiTokens = [];
    } else {
      if (body.apiTokens.length == 0) {
        // create secret key
        const result = await newApiToken(username);
        await redisSet("client:secret", user.username, result.secretKey);
      }
    }
    await editClient(data);

    return {
      status: 200,
      message: lang("utils.updateSuccess", langCode),
      data: body,
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

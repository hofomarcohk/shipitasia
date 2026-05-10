import { ApiError } from "@/app/api/api-error";
import { getLang, getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/wms/cms-middleware";
import { lang } from "@/lang/base";
import { editClient } from "@/services/admin/do_update_admin";
import { newApiToken } from "@/services/login/auth";
import { redisDel, redisSet } from "@/services/utils/redis";
import { ApiReturn } from "@/types/Api";
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
    await redisDel("client.user", user.username);

    delete user.password;

    user.username = (user.username[0] ?? "") + "*****"; // mask username
    return {
      status: 200,
      message: lang("utils.success", langCode),
      data: user,
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

    delete body.role;
    delete body.status;
    delete body.createdAt;
    delete body.username;

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
              address.id = randomUUID();
            }
            delete address.fullAddress;
            return address;
          })
        : [],
      payments: body.payments ?? [],
      externalTokens:
        body.externalTokens?.map((token: any) => ({
          ...token,
          expiredAt: new Date(token.expiredAt),
        })) ?? [],
      notifyApis: body.notifyApis ?? [],
    };

    if (body.is_passwordChange) {
      if (body.currentPassword && body.newPassword && body.confirmPassword) {
        if (body.newPassword !== body.confirmPassword) {
          throw new ApiError("NEW_PASSWORD_NOT_MATCH");
        }
        const isMatch = await bcrypt.compare(
          body.currentPassword,
          user.password,
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

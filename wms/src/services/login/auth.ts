import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import bcrypt from "bcrypt";
import { createHmac, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { decrypt, encrypt } from "../utils/crypto";
import { mongoEdit, mongoGet } from "../utils/mongodb";
import { redisGet, redisSet } from "../utils/redis";

export async function login(username: string, password: string) {
  const user = await mongoGet(collections.ADMIN, { username });
  if (!user) {
    throw new ApiError("INVALID_CREDENTIALS");
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError("INVALID_CREDENTIALS");
  }
  const expireIn = process.env.CMS_JWT_EXPIRES_IN || "1h";
  const secret = process.env.CMS_SECRET || "";
  const token = jwt.sign({ username: user.username }, secret, {
    expiresIn: expireIn,
  });
  const key = "client.user";
  await redisSet(key, username, user);
  return token;
}

export async function refreshToken(username: string) {
  const key = "client.user";
  const user = await redisGet(key, username);
  const expireIn = process.env.CMS_JWT_EXPIRES_IN || "1h";
  const secret = process.env.CMS_SECRET || "";
  const token = jwt.sign({ username }, secret, {
    expiresIn: expireIn,
  });
  await redisSet(key, username, user);
  return token;
}

export async function newApiToken(username: string) {
  const apiPublicKey = randomUUID();
  const apiSecretKey = randomUUID();
  await mongoEdit(
    collections.ADMIN,
    {
      username,
    },
    {
      $push: {
        apiTokens: {
          title: "API Token",
          apiKey: apiPublicKey,
          secretKey: encrypt(apiSecretKey),
          expireAt: new Date(),
        },
      },
    },
  );

  return {
    apiKey: apiPublicKey,
    secretKey: apiSecretKey,
  };
}
export async function getCmsUserFromToken(token: string, key: string) {
  if (!token) {
    throw new ApiError("UNAUTHORIZED");
  }
  const secret = process.env.CMS_SECRET || "";
  const decoded = jwt.verify(token, secret);
  const username = (decoded as jwt.JwtPayload).username;

  const cachedUser = await redisGet(key, username);
  if (cachedUser) {
    return cachedUser;
  }

  const user = await mongoGet(collections.ADMIN, { username });
  await redisSet(key, username, user);
  return user;
}

export async function clearCmsUserCache(username: string, key: string) {
  await redisSet(key, username, null);
}

// Api
export async function getApiToken(
  apiKey: string,
  timestamp: string,
  signature: string,
) {
  const smsSecret = process.env.SMS_API_SECRET || "";
  const expireIn = process.env.CMS_JWT_EXPIRES_IN || "1h";
  const secret = process.env.API_SECRET || "";

  const decryptedSecret = decrypt(smsSecret);
  const expectedSignature = await getSignature(
    apiKey,
    timestamp,
    decryptedSecret,
  );
  if (signature !== expectedSignature) {
    throw new ApiError("INVALID_CREDENTIALS");
  }

  const token = jwt.sign({ apiKey }, secret, {
    expiresIn: expireIn,
  });

  const key = "api.token";
  await redisSet(key, apiKey, "cms");
  return token;
}
export async function getSignature(
  apiKey: string,
  timestamp: string,
  apiSecret: string,
) {
  const message = `${apiKey}.${timestamp}`;
  const signature = createHmac("sha256", apiSecret)
    .update(message)
    .digest("hex");
  return signature;
}
export async function getApiUserFromToken(token: string, key: string) {
  if (!token) {
    throw new ApiError("UNAUTHORIZED");
  }
  const secret = process.env.API_SECRET || "";
  let decoded = null;

  try {
    decoded = jwt.verify(token, secret);
  } catch (e) {
    throw new ApiError("UNAUTHORIZED");
  }
  const apiKey = (decoded as jwt.JwtPayload).apiKey;

  const cachedUser = await redisGet(key, apiKey);
  if (cachedUser) {
    return cachedUser;
  }
  const user = await mongoGet(collections.ADMIN, {
    "apiTokens.apiKey": apiKey,
  });
  await redisSet(key, apiKey, user);
  return user;
}

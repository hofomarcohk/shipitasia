import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { Client } from "@/types/Client";
import bcrypt from "bcrypt";
import { createHmac, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { decrypt, encrypt } from "../utils/crypto";
import { mongoEdit, mongoGet } from "../utils/mongodb";
import { redisGet, redisSet } from "../utils/redis";

export async function login(username: string, password: string) {
  const user = await mongoGet(collections.CLIENT, { username });
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
  const user = await redisGet("client.user", username);
  const expireIn = process.env.CMS_JWT_EXPIRES_IN || "1h";
  const secret = process.env.CMS_SECRET || "";
  const token = jwt.sign({ username }, secret, {
    expiresIn: expireIn,
  });
  const key = "client.user";
  if (user) {
    await redisSet(key, username, user);
  }
  return token;
}

export async function newApiToken(username: string) {
  const apiPublicKey = randomUUID();
  const apiSecretKey = randomUUID();
  await mongoEdit(
    collections.CLIENT,
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
    }
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

  const user = await mongoGet(collections.CLIENT, { username });
  await redisSet(key, username, user);
  return user;
}

// Api
export async function getApiToken(
  apiKey: string,
  timestamp: string,
  signature: string
) {
  const user = (await mongoGet(collections.CLIENT, {
    "apiTokens.apiKey": apiKey,
  })) as Client | null;
  if (!user) {
    throw new ApiError("INVALID_CREDENTIALS");
  }

  const apiSecret = user.apiTokens.find((token) => {
    return token.apiKey == apiKey;
  })?.secretKey;
  if (!apiSecret) {
    throw new ApiError("INVALID_CREDENTIALS");
  }

  const expireIn = process.env.CMS_JWT_EXPIRES_IN || "1h";
  const secret = process.env.API_SECRET || "";

  const decryptedSecret = decrypt(apiSecret);
  const expectedSignature = await getSignature(
    apiKey,
    timestamp,
    decryptedSecret
  );
  if (signature !== expectedSignature) {
    throw new ApiError("INVALID_CREDENTIALS");
  }

  const token = jwt.sign({ apiKey }, secret, {
    expiresIn: expireIn,
  });

  const key = "api.token";
  await redisSet(key, apiKey, user);
  return token;
}
export async function getSignature(
  apiKey: string,
  timestamp: string,
  apiSecret: string
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
  const user = await mongoGet(collections.CLIENT, {
    "apiTokens.apiKey": apiKey,
  });
  await redisSet(key, apiKey, user);
  return user;
}

// WMS
export async function validteWmsToken(token: string, key: string) {
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

  if (apiKey != process.env.INCOMING_WMS_API_KEY) {
    throw new ApiError("UNAUTHORIZED");
  }
}

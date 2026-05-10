import { redisConfig } from "@/cst/redis/redisConfig";
import { redis } from "@/lib/redis";

const appName = process.env.APP_NAME || "app";

// redis
export async function redisGet(key: string, id: string) {
  key = appName + "-" + key.replace(/\./g, ":").toLowerCase() + ":" + id;
  const redisClient = await redis();
  const data = await redisClient.get(key);
  if (!data) {
    return null;
  }
  return JSON.parse(data);
}

export async function redisSet(
  key: string,
  id: string,
  value: any,
  expire: number = 600,
) {
  key = appName + "-" + key.replace(/\./g, ":").toLowerCase();
  const keyPath = key.split(":");
  let expireConfig = { ...redisConfig };
  // get expire from redisConfig
  for (const k of keyPath) {
    if (expireConfig[k]) {
      expireConfig = expireConfig[k];
    }
  }
  if (expireConfig.ttl) {
    expire = expireConfig.ttl;
  }
  key = key + ":" + id;
  const redisClient = await redis();
  await redisClient.set(key, JSON.stringify(value), "EX", expire);
}

export async function redisGetSet(
  key: string,
  id: string,
  callback: any,
  expire: number = 600,
) {
  const data = await redisGet(key, id);
  if (data) {
    return data;
  }
  const value = await callback();
  await redisSet(key.toLocaleLowerCase(), id, value, expire);
  return value;
}

export async function redisDel(key: string, id: string) {
  const redisClient = await redis();
  key = appName + "-" + key.replace(/\./g, ":").toLowerCase();
  await redisClient.del(key + ":" + id);
}

export async function redisHset(key: string, field: string) {
  const redisClient = await redis();
  key = appName + "-" + key.replace(/\./g, ":").toLowerCase();
  await redisClient.hset(key, field, 1);
}

export async function redisHincr(key: string, field: string) {
  const redisClient = await redis();
  key = appName + "-" + key.replace(/\./g, ":").toLowerCase();
  return await redisClient.hincrby(key, field, 1);
}

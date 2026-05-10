// eslint-disable-next-line @typescript-eslint/no-require-imports
const Redis = require("ioredis");

let cachedDb: any = null;
const host = process.env.REDIS_URI;
const port = process.env.REDIS_PORT;
const password = process.env.REDIS_PASSWORD;

if (!host) {
  throw new Error("REDIS_URI is not defined");
}

const client = new Redis({
  host,
  port,
  password,
});

export async function redis() {
  if (cachedDb) {
    return cachedDb;
  }
  cachedDb = client;
  return cachedDb;
}

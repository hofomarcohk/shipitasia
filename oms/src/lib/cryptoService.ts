import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CRYPTO_SERVICE_KEY_MISSING: set ENCRYPTION_KEY env (base64 32 bytes, generate with `openssl rand -base64 32`)"
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LENGTH) {
    throw new Error(
      `CRYPTO_SERVICE_KEY_LENGTH: ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${buf.length})`
    );
  }
  cachedKey = buf;
  return buf;
}

export function encrypt(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new Error("CRYPTO_SERVICE_BAD_INPUT: plaintext must be a string");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  if (typeof payload !== "string" || payload.length === 0) {
    throw new Error("CRYPTO_SERVICE_BAD_PAYLOAD: payload must be non-empty base64 string");
  }
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("CRYPTO_SERVICE_BAD_PAYLOAD: payload too short");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const enc = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T = unknown>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}

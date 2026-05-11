import { ApiError } from "@/app/api/api-error";
import fs from "node:fs/promises";
import path from "node:path";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/jpg", "image/png"]);
const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png"]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 5;

export interface PhotoUploadInput {
  warehouseCode: string;
  scan_id: string;
  type: "barcode" | "package" | "anomaly";
  files: { buffer: Buffer; size: number; mime: string; original_name: string }[];
}

export interface PhotoUploadResult {
  paths: string[];
  metadata: { type: "barcode" | "package" | "anomaly"; size: number; mime: string }[];
}

function uploadsBase(): string {
  return process.env.UPLOADS_BASE_PATH || "./uploads";
}

function formatDate(d: Date): string {
  return (
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

export async function savePhotos(
  input: PhotoUploadInput
): Promise<PhotoUploadResult> {
  if (input.files.length === 0) return { paths: [], metadata: [] };
  if (input.files.length > MAX_PHOTOS) throw new ApiError("TOO_MANY_PHOTOS");

  const paths: string[] = [];
  const metadata: PhotoUploadResult["metadata"] = [];
  const dateStr = formatDate(new Date());

  for (let i = 0; i < input.files.length; i++) {
    const f = input.files[i];
    if (f.size > MAX_BYTES) throw new ApiError("PHOTO_TOO_LARGE");
    if (!ALLOWED_MIMES.has(f.mime.toLowerCase())) {
      throw new ApiError("INVALID_PHOTO_TYPE");
    }
    const ext = (f.original_name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) throw new ApiError("INVALID_PHOTO_TYPE");

    const relative = path.join(
      "inbound-photos",
      input.warehouseCode,
      dateStr,
      `${input.scan_id}_${input.type}_${i + 1}.${ext}`
    );
    const absolute = path.join(uploadsBase(), relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, f.buffer);

    paths.push(relative);
    metadata.push({ type: input.type, size: f.size, mime: f.mime });
  }

  return { paths, metadata };
}

export async function unlinkPhotos(paths: string[]): Promise<void> {
  for (const p of paths) {
    const abs = path.join(uploadsBase(), p);
    await fs.unlink(abs).catch(() => {});
  }
}

export async function readPhoto(
  relativePath: string
): Promise<{ buffer: Buffer; mime: string }> {
  const abs = path.join(uploadsBase(), relativePath);
  const buffer = await fs.readFile(abs);
  const ext = path.extname(relativePath).slice(1).toLowerCase();
  const mime =
    ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";
  return { buffer, mime };
}

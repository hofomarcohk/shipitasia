import { NextRequest } from "next/server";

export interface ParsedFile {
  buffer: Buffer;
  size: number;
  mime: string;
  original_name: string;
}

export interface ParsedMultipart {
  fields: Record<string, string>;
  files: Record<string, ParsedFile[]>;
}

/**
 * Parses a multipart/form-data body. File fields named `photo_barcode`,
 * `photo_package`, `photo_anomaly`, etc collect into the files map. JSON
 * fields like `anomalies` (string) are returned in `fields` for the route
 * to JSON.parse.
 */
export async function parseMultipart(req: NextRequest): Promise<ParsedMultipart> {
  const form = await req.formData();
  const fields: Record<string, string> = {};
  const files: Record<string, ParsedFile[]> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
    } else {
      const buffer = Buffer.from(await value.arrayBuffer());
      (files[key] ??= []).push({
        buffer,
        size: value.size,
        mime: value.type || "application/octet-stream",
        original_name: value.name || "upload",
      });
    }
  }
  return { fields, files };
}

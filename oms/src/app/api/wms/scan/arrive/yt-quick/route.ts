// P17 — YT S2 pure-scan arrive.
//
// PDA dispatches here when classifyArrival() returns "yt". Body is
// JSON (no photos at S2) — operator just keeps scanning. S3 shelve
// captures location + weight + dimension + photos.

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { quickArriveYt } from "@/services/scan/yt-arrive";
import { ApiReturn } from "@/types/Api";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return cmsMiddleware(
    request,
    body,
    async (): Promise<ApiReturn> => {
      const principal = requireStaff(request);
      const result = await quickArriveYt(body, principal);
      return { status: 200, message: "Success", data: result };
    }
  );
}

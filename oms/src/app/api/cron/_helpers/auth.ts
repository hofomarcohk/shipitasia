// P17 — cron-endpoint auth guard.
//
// Cron routes live under /api/cron/*. They're called either by the
// in-process cron driver (scripts/cron.mjs) or by an ops engineer
// manually smoke-testing a job. We don't want them callable from a
// browser by accident, so we gate on a shared secret.
//
// Set CRON_SECRET in .env; the cron driver reads the same value.
// In dev without the env var set, the gate is bypassed so local
// developers can hit the endpoints from a REST client. Production
// must set it.

import { NextRequest } from "next/server";

import { ApiError } from "@/app/api/api-error";

export function requireCronAuth(request: NextRequest): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Dev-mode bypass: log once per call so it's hard to miss when
    // promoting to prod.
    if (process.env.NODE_ENV === "production") {
      throw new ApiError("UNAUTHORIZED", { detail: "CRON_SECRET not set" });
    }
    return;
  }
  const header = request.headers.get("authorization") ?? "";
  const got = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (got !== expected) {
    throw new ApiError("UNAUTHORIZED");
  }
}

import { NextRequest, NextResponse } from "next/server";

// Logout doesn't need auth gating — anonymous calls just no-op. We always
// clear the cookie so a stale/expired JWT also gets wiped, and so users
// re-login (picking up role claim updates etc.) without browser cookie
// surgery.
export async function GET(_request: NextRequest) {
  const res = NextResponse.json({
    status: 200,
    message: "Success",
  });
  res.cookies.set({
    name: "token",
    value: "",
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return res;
}

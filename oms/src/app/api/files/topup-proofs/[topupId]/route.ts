import { ApiError } from "@/app/api/api-error";
import { getCmsToken } from "@/app/api/cms/cms-middleware";
import { readProofFile } from "@/services/wallet/topup-requests";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

// Authenticated file fetch. Admin sees any proof; clients see only their own.
// Streams the raw binary back with the recorded mime type.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ topupId: string }> }
) {
  const { topupId } = await params;
  const token = getCmsToken(request);
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, process.env.CMS_SECRET || "") as jwt.JwtPayload;
  } catch {
    return NextResponse.json(
      { status: 401, message: "Unauthorized" },
      { status: 401 }
    );
  }
  const client_id = (payload as any).clientId as string | undefined;
  const role = (payload as any).role;
  const username = (payload as any).username;
  const isAdmin = role === "admin" || username === "admin";

  try {
    const { buffer, mime, filename } = await readProofFile(topupId, {
      client_id,
      is_admin: isAdmin,
    });
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e: any) {
    if (e instanceof ApiError) {
      const code = e.name;
      const status =
        code === "PROOF_FILE_FORBIDDEN" ? 403 :
        code === "TOPUP_REQUEST_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { status, message: e.message },
        { status }
      );
    }
    return NextResponse.json(
      { status: 500, message: (e as Error).message },
      { status: 500 }
    );
  }
}

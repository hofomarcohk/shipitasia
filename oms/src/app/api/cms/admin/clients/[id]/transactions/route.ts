import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { walletService } from "@/services/wallet/walletService";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    requireAdmin(request);
    const sp = new URL(request.url).searchParams;
    const parseDate = (s: string | null) => (s ? new Date(s) : undefined);
    const balance = await walletService.getBalance(id);
    const result = await walletService.getTransactionsAdmin(id, {
      from: parseDate(sp.get("from")),
      to: parseDate(sp.get("to")),
      type: sp.get("type") ?? undefined,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
      offset: sp.get("offset") ? parseInt(sp.get("offset")!, 10) : undefined,
    });
    return {
      status: 200,
      message: "Success",
      data: { balance, ...result },
    };
  });
}

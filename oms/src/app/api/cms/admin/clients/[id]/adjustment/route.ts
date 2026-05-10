import { getParam } from "@/app/api/api-helper";
import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireAdmin } from "@/app/api/cms/admin/_helpers/admin-auth";
import { walletService } from "@/services/wallet/walletService";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";
import { z } from "zod";

const AdjustmentBodySchema = z
  .object({
    amount: z.coerce.number().int(),
    customer_note: z.string().min(1).max(200),
    internal_note: z.string().max(500).optional(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const principal = requireAdmin(request);
    const input = AdjustmentBodySchema.parse(body);
    const result = await walletService.adjustment({
      client_id: id,
      amount: input.amount,
      operator_staff_id: principal.staff_id,
      customer_note: input.customer_note,
      internal_note: input.internal_note,
    });
    return { status: 200, message: "Adjusted", data: result };
  });
}

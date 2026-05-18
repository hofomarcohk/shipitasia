// P14 — "立即排出庫" endpoint. Flips the group from pending → force_released
// so the P15 cron emits the outbound on its next pass without waiting for
// the 3-working-day SLA.
//
// P14b: body { inbound_ids?: string[] }. When supplied, only that subset is
// released — they split off into a fresh force_released group and the
// remaining shelved siblings stay in the original pending group with a
// recomputed SLA anchor. Empty / omitted = release the whole group.

import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { getParam } from "@/app/api/api-helper";
import { forceReleaseGroup } from "@/services/consolidation/consolidation-service";
import { sweepGroupById } from "@/services/consolidation/sweep";
import { ApiReturn } from "@/types/Api";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

function clientIdFromJwt(req: NextRequest): string {
  const token = getCmsToken(req);
  const payload = jwt.verify(
    token,
    process.env.CMS_SECRET || ""
  ) as jwt.JwtPayload;
  return (payload as any).clientId as string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const { id } = await context.params;
    const inbound_ids = Array.isArray(body?.inbound_ids)
      ? body.inbound_ids.filter((x: unknown) => typeof x === "string")
      : undefined;
    const result = await forceReleaseGroup({
      client_id,
      group_id: id,
      ...(inbound_ids && inbound_ids.length > 0 ? { inbound_ids } : {}),
    });
    // P14b — fire the sweep on the newly force_released group right now
    // so the customer sees the outbound show up in WMS without waiting
    // for the daily cron. Whole-group release: result.group_id === the
    // original id; subset release: result.group_id === the new split id.
    // Both cases live in `force_released` status at this point.
    const sweep = await sweepGroupById(result.group_id);
    return {
      status: 200,
      message: "Success",
      data: { ...result, sweep },
    };
  });
}

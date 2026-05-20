// GET /api/cms/shipments/overview?stage=<key>
// Single dispatch endpoint for the v2 OMS overview page. Returns
// stage-specific data already shaped for the corresponding stage view.
//
// stage values:
//   waiting_inbound        → { rows: WaitingInboundRow[] }
//   shelved                → { managed: ConsolidationGroup[], manualPending: ManualPendingRow[] }
//   waiting_consolidate    → { rows: ConsolidateOutbound[] }
//   consolidated           → { rows: OutboundCard[] }
//   waiting_dispatch       → { rows: OutboundCard[] }
//   dispatched             → { rows: DispatchedRow[] }

import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import {
  listConsolidated,
  listDispatched,
  listShelved,
  listWaitingConsolidate,
  listWaitingDispatch,
  listWaitingInbound,
} from "@/services/shipment-overview/overview-service";
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

export async function GET(request: NextRequest) {
  return cmsMiddleware(request, null, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const stage = new URL(request.url).searchParams.get("stage") ?? "waiting_inbound";

    switch (stage) {
      case "waiting_inbound":
        return {
          status: 200,
          message: "Success",
          data: { rows: await listWaitingInbound(client_id) },
        };
      case "shelved":
        return {
          status: 200,
          message: "Success",
          data: await listShelved(client_id),
        };
      case "waiting_consolidate":
        return {
          status: 200,
          message: "Success",
          data: { rows: await listWaitingConsolidate(client_id) },
        };
      case "consolidated":
        return {
          status: 200,
          message: "Success",
          data: { rows: await listConsolidated(client_id) },
        };
      case "waiting_dispatch":
        return {
          status: 200,
          message: "Success",
          data: { rows: await listWaitingDispatch(client_id) },
        };
      case "dispatched":
        return {
          status: 200,
          message: "Success",
          data: { rows: await listDispatched(client_id) },
        };
      default:
        return { status: 400, message: `Unknown stage: ${stage}` };
    }
  });
}

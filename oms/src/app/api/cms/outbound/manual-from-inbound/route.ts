// POST /api/cms/outbound/manual-from-inbound
// Body: { inbound_ids: string[] }
//
// Stage 2「建立出庫單」 action. Builds a consolidated outbound from the
// selected manual-pending inbounds (status=received, shipping_mode=
// manual_consolidate, no existing outbound link). Inbounds must share the
// same shipping_destination so we can derive carrier + address.

import { getParam } from "@/app/api/api-helper";
import {
  cmsMiddleware,
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { createConsolidatedOutbound } from "@/services/outbound/outbound-service";
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

function ipOf(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const client_id = clientIdFromJwt(request);
    const inboundIds: string[] = Array.isArray(body?.inbound_ids)
      ? body.inbound_ids.filter((x: unknown) => typeof x === "string")
      : [];
    if (inboundIds.length === 0) {
      return { status: 400, message: "inbound_ids required" };
    }

    const db = await connectToDatabase();
    const inbounds = await db
      .collection(collections.INBOUND)
      .find({ _id: { $in: inboundIds } as any, client_id })
      .toArray();

    if (inbounds.length !== inboundIds.length) {
      throw new ApiError("INBOUND_NOT_FOUND");
    }

    for (const ib of inbounds) {
      if (ib.status !== "received") {
        return {
          status: 400,
          message: `Inbound ${ib._id} is not shelved (status=${ib.status})`,
        };
      }
      if (ib.shipping_mode !== "manual_consolidate") {
        return {
          status: 400,
          message: `Inbound ${ib._id} is not in manual_consolidate mode`,
        };
      }
    }

    // All inbounds must share the same shipping destination so we can derive
    // carrier + address. Use the first inbound's destination as the source.
    const first = inbounds[0];
    const dest = first.shipping_destination;
    if (!dest?.receiver_address_snapshot || !dest?.carrier_account_id) {
      return {
        status: 400,
        message: "First inbound is missing shipping_destination",
      };
    }
    const sameDest = inbounds.every(
      (ib: any) =>
        ib.shipping_destination?.carrier_account_id ===
          dest.carrier_account_id &&
        ib.shipping_destination?.saved_address_id ===
          dest.saved_address_id
    );
    if (!sameDest) {
      return {
        status: 400,
        message: "Selected inbounds must share the same recipient and carrier",
      };
    }

    const carrierAccount = await db
      .collection(collections.CLIENT_CARRIER_ACCOUNT)
      .findOne({ _id: dest.carrier_account_id as any, client_id });
    if (!carrierAccount) {
      return {
        status: 400,
        message: "Carrier account not found",
      };
    }

    const data = await createConsolidatedOutbound(
      {
        client_id,
        ip_address: ipOf(request),
        user_agent: request.headers.get("user-agent") ?? undefined,
      },
      {
        inbound_ids: inboundIds,
        carrier_code: carrierAccount.carrier_code,
        carrier_account_id: String(carrierAccount._id),
        service_code: carrierAccount.default_service_code ?? "STANDARD",
        receiver_address: dest.receiver_address_snapshot,
        processing_preference: "confirm_before_label",
        customer_remarks: null,
        disallow_consolidation: false,
      }
    );
    return { status: 200, message: "Outbound created", data };
  });
}

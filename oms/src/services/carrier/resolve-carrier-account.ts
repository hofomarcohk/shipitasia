// P17 — Carrier-account resolver.
//
// Single entry point used by outbound label-fetch (weigh + palletize),
// rate-quote refresh, and depart flows to obtain the carrier account
// credentials to use for a given outbound. Branches on outbound.is_yt:
//
//   - YT outbound → load the WMS-owned (owner_type:"system") account for
//     the carrier on the outbound row. Marco's spec rules out
//     client-supplied accounts for YT; mis-configured outbounds throw.
//
//   - Non-YT (default) → load the client-owned account already set on
//     outbound.carrier_account_id. Preserves the existing v1 contract;
//     no behavioural change for the集運 flow.
//
// Returned doc is the raw Mongo document (not projected) because
// downstream label-fetch needs credentials_enc. Callers must NOT echo
// this back to the wire.
//
// Pre-real-API note: in mock phase the system fuuffy account has a
// placeholder credentials_enc string. Mock adapter ignores it.
// Production cutover swaps it via admin OAuth flow without touching
// this resolver.
import { ObjectId } from "mongodb";

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

export interface OutboundCarrierInput {
  _id: string;
  is_yt?: boolean | null;
  carrier_code: string;
  carrier_account_id?: string | null;
  client_id?: string | null;
}

export interface ResolvedCarrierAccount {
  account_id: string;
  owner_type: "client" | "system";
  carrier_code: string;
  doc: any;
}

export async function resolveCarrierAccount(
  ob: OutboundCarrierInput
): Promise<ResolvedCarrierAccount> {
  const db = await connectToDatabase();

  if (ob.is_yt) {
    const doc = await db
      .collection(collections.CLIENT_CARRIER_ACCOUNT)
      .findOne({
        owner_type: "system",
        carrier_code: ob.carrier_code,
        deleted_at: null,
        status: "active",
      });
    if (!doc) {
      throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND", {
        detail: `system account for ${ob.carrier_code} not seeded; run migration 20260521000002-p17-system-fuuffy-account`,
      });
    }
    return {
      account_id: String(doc._id),
      owner_type: "system",
      carrier_code: doc.carrier_code,
      doc,
    };
  }

  if (!ob.carrier_account_id) {
    throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND", {
      detail: `outbound ${ob._id} has no carrier_account_id`,
    });
  }
  let objId: ObjectId;
  try {
    objId = new ObjectId(ob.carrier_account_id);
  } catch {
    throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");
  }
  const doc = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .findOne({
      _id: objId,
      // Either explicit client-owned, or pre-P17 row with no owner_type
      // field (treated as client for back-compat).
      $or: [{ owner_type: "client" }, { owner_type: { $exists: false } }],
      client_id: ob.client_id,
      deleted_at: null,
    });
  if (!doc) throw new ApiError("CARRIER_ACCOUNT_NOT_FOUND");
  return {
    account_id: String(doc._id),
    owner_type: "client",
    carrier_code: doc.carrier_code,
    doc,
  };
}

// P17 — staff-facing carrier-account listing for WMS #courier page.
//
// The original listClientAccounts() in client-carrier-accounts.ts is
// scoped to a single client (ctx.client_id) — fine for OMS portal,
// but the WMS desktop needs to see every client's accounts plus the
// system-owned rows for QA/admin tasks (which client uses which
// carrier? Is the SIA YT account healthy?).
//
// Mirrors listClientAccounts's projection contract (no credentials
// leakage) but adds owner_type + client_name so the UI can render the
// "SIA(YT)" badge alongside client-owned rows.
//
// No write functions here yet — credential editing still goes
// through the existing OAuth + api-key flows in
// client-carrier-accounts.ts (per-client). WMS-side write surface
// would need fresh permission gating; defer until the handoff
// #courier page actually demands editing.

import { ObjectId } from "mongodb";

import { collections } from "@/cst/collections";
import { SYSTEM_CLIENT_ID } from "@/cst/system";
import { connectToDatabase } from "@/lib/mongo";

export interface StaffCarrierAccountRow {
  account_id: string;
  owner_type: "client" | "system";
  client_id: string | null;
  client_name: string | null;
  carrier_code: string;
  nickname: string;
  auth_type: "api_key" | "oauth";
  is_default: boolean;
  status: "active" | "expired" | "revoked";
  last_used_at: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ListStaffAccountsFilter {
  carrier_code?: string;
  owner_type?: "client" | "system";
  status?: "active" | "expired" | "revoked";
  q?: string; // free-text search across nickname + client_name
  limit?: number;
}

async function loadClientNames(
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.CLIENT)
    .find({
      _id: {
        $in: ids.map((id) =>
          ObjectId.isValid(id) ? new ObjectId(id) : (id as any)
        ) as any,
      },
    })
    .project({ _id: 1, company_name: 1, display_name: 1, email: 1 })
    .toArray();
  for (const c of docs) {
    const id = String(c._id);
    map.set(id, c.company_name || c.display_name || c.email || id);
  }
  return map;
}

export async function listStaffCarrierAccounts(
  filter: ListStaffAccountsFilter = {}
): Promise<StaffCarrierAccountRow[]> {
  const db = await connectToDatabase();
  const mongoFilter: Record<string, unknown> = {
    deleted_at: null,
  };
  if (filter.carrier_code) mongoFilter.carrier_code = filter.carrier_code;
  if (filter.owner_type) mongoFilter.owner_type = filter.owner_type;
  if (filter.status) mongoFilter.status = filter.status;

  const limit = Math.min(filter.limit ?? 200, 500);
  const docs = await db
    .collection(collections.CLIENT_CARRIER_ACCOUNT)
    .find(mongoFilter)
    .sort({ owner_type: -1, carrier_code: 1, nickname: 1 })
    .limit(limit)
    .toArray();

  const realClientIds = Array.from(
    new Set(
      docs
        .map((d: any) => d.client_id)
        .filter(
          (id: any) =>
            typeof id === "string" && id.length > 0 && id !== SYSTEM_CLIENT_ID
        )
    )
  );
  const clientNames = await loadClientNames(realClientIds);

  const rows: StaffCarrierAccountRow[] = docs.map((d: any) => {
    const isSystem = d.owner_type === "system";
    return {
      account_id: String(d._id),
      owner_type: isSystem ? "system" : "client",
      client_id: isSystem ? null : d.client_id ?? null,
      client_name: isSystem
        ? "ShipItAsia (system)"
        : clientNames.get(d.client_id) ?? d.client_id ?? null,
      carrier_code: d.carrier_code,
      nickname: d.nickname,
      auth_type: d.auth_type,
      is_default: !!d.is_default,
      status: d.status,
      last_used_at: d.last_used_at ?? null,
      createdAt: d.createdAt ?? null,
      updatedAt: d.updatedAt ?? null,
    };
  });

  if (filter.q) {
    const needle = filter.q.toLowerCase();
    return rows.filter(
      (r) =>
        r.nickname.toLowerCase().includes(needle) ||
        (r.client_name ?? "").toLowerCase().includes(needle) ||
        r.carrier_code.toLowerCase().includes(needle)
    );
  }
  return rows;
}

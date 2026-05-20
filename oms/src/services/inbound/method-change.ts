// New client-driven mutations for v2 shipment overview:
//   - detachInboundAndFlipToManual: remove inbound from its managed group +
//     flip shipping_mode to "manual_consolidate". Used by Stage 2 row-level
//     「解除自動，改為手動」action.
//   - changeInboundShippingMethod: switch shipping_mode while status === pending.
//     Detaches from the existing consolidation_group when leaving managed mode,
//     and validates the required fields for the target mode. Used by Stage 1
//     method chip dropdown / ⋮ menu.
//
// Both functions follow the existing inbound-service.ts patterns
// (ClientContext, ApiError, logAudit, createNotification) and only write when
// the inbound is still in "pending" status.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
} from "@/constants/auditActions";
import { connectToDatabase } from "@/lib/mongo";
import { logAudit } from "@/services/audit/log";
import { createNotification } from "@/services/notification/notification";
import { projectInboundV1 } from "@/types/InboundV1";
import { z } from "zod";
import type { ClientContext } from "./inbound-service";

type ShippingMode = "managed_consign" | "single_direct" | "manual_consolidate";

/**
 * Internal: $pull inbound from its consolidation_group.forecast_ids and clear
 * inbound.consolidation_group_id. No-op when the inbound isn't attached to a
 * group. Caller is responsible for updating shipping_mode separately.
 */
async function detachFromGroup(db: any, inbound: any): Promise<void> {
  const groupId: string | null = inbound.consolidation_group_id ?? null;
  if (!groupId) return;

  const now = new Date();
  await db.collection(collections.CONSOLIDATION_GROUP).updateOne(
    { _id: groupId as any, status: "pending" },
    { $pull: { forecast_ids: inbound._id }, $set: { updatedAt: now } }
  );
  await db
    .collection(collections.INBOUND)
    .updateOne(
      { _id: inbound._id },
      { $set: { consolidation_group_id: null, updatedAt: now } }
    );
}

/* ─────────────────────────────────────────────────────────────
 * detachInboundAndFlipToManual
 * ──────────────────────────────────────────────────────────── */

export async function detachInboundAndFlipToManual(
  id: string,
  ctx: ClientContext
) {
  const db = await connectToDatabase();
  const inbound = await db
    .collection(collections.INBOUND)
    .findOne({ _id: id as any, client_id: ctx.client_id });
  if (!inbound) throw new ApiError("INBOUND_NOT_FOUND");
  if (inbound.status !== "pending") {
    throw new ApiError("CANNOT_CHANGE_METHOD_AFTER_ARRIVED");
  }

  await detachFromGroup(db, inbound);

  const now = new Date();
  await db.collection(collections.INBOUND).updateOne(
    { _id: inbound._id },
    {
      $set: {
        shipping_mode: "manual_consolidate" as ShippingMode,
        updatedAt: now,
      },
    }
  );

  await createNotification({
    client_id: ctx.client_id,
    type: "inbound_updated",
    title: "預報已改為手動併貨",
    body: `預報 ${id} 已由託管組移除，需於上架後自行揀件建單`,
    reference_type: "inbound",
    reference_id: id,
  });

  await logAudit({
    action: AUDIT_ACTIONS.inbound_detached_to_manual,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: id,
    details: {
      previous_mode: inbound.shipping_mode,
      previous_group_id: inbound.consolidation_group_id ?? null,
    },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  const fresh = await db
    .collection(collections.INBOUND)
    .findOne({ _id: id as any });
  return projectInboundV1(fresh);
}

/* ─────────────────────────────────────────────────────────────
 * changeInboundShippingMethod
 * ──────────────────────────────────────────────────────────── */

export const ChangeMethodInputSchema = z
  .object({
    to_method: z.enum(["managed_consign", "single_direct", "manual_consolidate"]),
    /** Required when to_method === "managed_consign". */
    saved_address_id: z.string().optional(),
    /** Required when to_method === "managed_consign". */
    carrier_account_id: z.string().optional(),
  })
  .strict();

export type ChangeMethodInput = z.infer<typeof ChangeMethodInputSchema>;

export async function changeInboundShippingMethod(
  id: string,
  raw: unknown,
  ctx: ClientContext
) {
  const input = ChangeMethodInputSchema.parse(raw);
  if (
    input.to_method === "managed_consign" &&
    (!input.saved_address_id || !input.carrier_account_id)
  ) {
    throw new ApiError("MANAGED_REQUIRES_ADDRESS_AND_CARRIER");
  }

  const db = await connectToDatabase();
  const inbound = await db
    .collection(collections.INBOUND)
    .findOne({ _id: id as any, client_id: ctx.client_id });
  if (!inbound) throw new ApiError("INBOUND_NOT_FOUND");
  if (inbound.status !== "pending") {
    throw new ApiError("CANNOT_CHANGE_METHOD_AFTER_ARRIVED");
  }
  if (inbound.shipping_mode === input.to_method) {
    throw new ApiError("SAME_SHIPPING_MODE");
  }

  // Always detach from the existing group first to avoid orphaning forecast_ids
  // (P13 constraint). Re-attaching to a new managed group is intentionally left
  // to the sweep / group-finder cron so this endpoint stays focused.
  await detachFromGroup(db, inbound);

  const now = new Date();
  const set: Record<string, unknown> = {
    shipping_mode: input.to_method as ShippingMode,
    updatedAt: now,
  };
  if (input.to_method === "managed_consign") {
    set.saved_address_id = input.saved_address_id;
    set.carrier_account_id = input.carrier_account_id;
  }
  await db
    .collection(collections.INBOUND)
    .updateOne({ _id: inbound._id }, { $set: set });

  await createNotification({
    client_id: ctx.client_id,
    type: "inbound_updated",
    title: "預報寄送方式已更新",
    body: `預報 ${id} 已改為 ${input.to_method}`,
    reference_type: "inbound",
    reference_id: id,
  });

  await logAudit({
    action: AUDIT_ACTIONS.inbound_shipping_mode_changed,
    actor_type: AUDIT_ACTOR_TYPES.client,
    actor_id: ctx.client_id,
    target_type: AUDIT_TARGET_TYPES.inbound,
    target_id: id,
    details: {
      previous_mode: inbound.shipping_mode,
      new_mode: input.to_method,
      previous_group_id: inbound.consolidation_group_id ?? null,
    },
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  const fresh = await db
    .collection(collections.INBOUND)
    .findOne({ _id: id as any });
  return projectInboundV1(fresh);
}

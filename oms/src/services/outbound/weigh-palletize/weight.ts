import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

/**
 * Empty box (tare) weight assumption. Added on top of the sum of inbound
 * actual weights to compute the expected box weight.
 */
export const TARE_KG = 1;

/**
 * Soft tolerance. Below this delta we only surface a red-text warning;
 * above it the save is gated behind an explicit `force` confirmation.
 */
export const WEIGHT_TOLERANCE_KG = 0.5;

/**
 * Compute the expected box weight = Σ inbound.actualWeight + tare, for all
 * inbounds referenced by the box's items.
 */
export async function expectedWeightForInboundIds(
  inbound_ids: string[]
): Promise<{ sum_actual: number; expected: number }> {
  if (inbound_ids.length === 0) return { sum_actual: 0, expected: TARE_KG };
  const db = await connectToDatabase();
  const docs = await db
    .collection(collections.INBOUND)
    .find(
      { _id: { $in: inbound_ids } },
      { projection: { actualWeight: 1 } } as any
    )
    .toArray();
  let sum = 0;
  for (const d of docs) {
    const w = Number((d as any).actualWeight || 0);
    if (Number.isFinite(w) && w > 0) sum += w;
  }
  const rounded = Math.round(sum * 1000) / 1000;
  return { sum_actual: rounded, expected: Math.round((rounded + TARE_KG) * 1000) / 1000 };
}

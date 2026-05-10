import { aggregateOutbound } from "../getter";

export async function getPackBoxesByOrderId(orderId: string) {
  return (
    (
      await aggregateOutbound([
        { $match: { orderId } },
        { $project: { boxes: 1 } },
      ])
    )?.[0]?.boxes ?? []
  );
}

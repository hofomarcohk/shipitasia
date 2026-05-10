import { z } from "zod";
import { AddressSchema } from "./Address";

export const AutoOutboundConditionSchema = z
  .object({
    type: z.string(),
    operator: z.string(),
    value: z.string(),
  })
  .strict();

export const AutoOutboundSchema = z
  .object({
    recordId: z.string(),
    clientId: z.string(),
    name: z.string().optional(),
    warehouseCode: z.string(),
    condition: AutoOutboundConditionSchema,
    to: AddressSchema,
    isActive: z.boolean(),
    deletedAt: z.date().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type AutoOutbound = z.infer<typeof AutoOutboundSchema>;

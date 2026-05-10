import { INBOUND } from "@/cst/inbound";
import { z } from "zod";
import { AddressSchema } from "./Address";

export const InboundSchema = z
  .object({
    orderId: z.string(),
    clientId: z.string(),
    source: z.string(),
    warehouseCode: z.string(),
    category: z.string().array().optional(),
    status: z.enum(Object.values(INBOUND.STATUS) as [string, ...string[]]),
    from: AddressSchema.optional(),
    to: AddressSchema,
    declaredValue: z.number().optional(),
    width: z.number().optional(),
    length: z.number().optional(),
    height: z.number().optional(),
    weight: z.number().optional(),
    trackingNo: z.string().optional(),
    restrictionTags: z.string().array().optional(),
    remarks: z.string().optional(),
    referenceNo: z.string().optional(),
    willArrivedAt: z.date().nullable().optional(),
    inboundingAt: z.date().nullable().optional(),
    inboundedAt: z.date().nullable().optional(),
    outboundingAt: z.date().nullable().optional(),
    outboundedAt: z.date().nullable().optional(),
    cancelledAt: z.date().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type Inbound = z.infer<typeof InboundSchema>;
export type InboundRequestStatus = z.infer<typeof InboundSchema>["status"];

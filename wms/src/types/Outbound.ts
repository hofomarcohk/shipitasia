import { OUTBOUND } from "@/cst/outbound";
import { z } from "zod";
import { AddressSchema } from "./Address";

export const OutboundSchema = z
  .object({
    orderId: z.string(),
    clientId: z.string(),
    warehouseCode: z.string(),
    status: z.enum(Object.values(OUTBOUND.STATUS) as [string, ...string[]]),
    logisticParty: z.string(),
    logisticService: z.string().optional(),
    trackingNo: z.string().optional(),
    source: z.string(),
    to: AddressSchema,
    width: z.number().optional(),
    length: z.number().optional(),
    height: z.number().optional(),
    weight: z.number().optional(),
    remarks: z.string().optional(),
    referenceNo: z.string().optional(),
    inboundRequestIds: z.string().array().optional(),
    outboundingAt: z.date().nullable().optional(),
    outboundedAt: z.date().nullable().optional(),
    cancelledAt: z.date().nullable().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string(),
  })
  .strict();

export type Outbound = z.infer<typeof OutboundSchema>;
export type OutboundRequestStatus = z.infer<typeof OutboundSchema>["status"];

export const PackBoxSchema = z
  .object({
    boxNo: z.string(),
    width: z.number().optional().default(0),
    length: z.number().optional().default(0),
    height: z.number().optional().default(0),
    weight: z.number().optional().default(0),
    trackingNo: z.string().optional().default(""),
  })
  .strict();
export type PackBox = z.infer<typeof PackBoxSchema>;

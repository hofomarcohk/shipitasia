import { OUTBOUND } from "@/cst/outbound";
import { Double } from "mongodb";
import { z } from "zod";
import { Address, AddressSchema } from "./Address";

export type OutboundRequestStatus =
  | "pending"
  | "outbounding"
  | "outbounded"
  | "cancelled";

export const OutboundSchema = z
  .object({
    clientId: z.string(),
    orderId: z.string(),
    warehouseCode: z.string(),
    status: z.enum(Object.values(OUTBOUND.STATUS) as [string, ...string[]]),
    to: AddressSchema,
    inboundRequestIds: z.string().array().optional(),
    width: z.number().optional(),
    length: z.number().optional(),
    height: z.number().optional(),
    weight: z.number().optional(),
    logisticParty: z.string(),
    logisticService: z.string().optional(),
    trackingNo: z.string().optional(),
    remarks: z.string().optional(),
    referenceNo: z.string().optional(),
    source: z.string(),
    outboundingAt: z.date().nullable().optional(),
    outboundedAt: z.date().nullable().optional(),
    cancelledAt: z.date().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type Outbound = z.infer<typeof OutboundSchema>;
export type AutoOutboundSetting = {
  clientId: string;
  status: boolean;
  warehouse: string;
  title: string;
  condition: {
    type: "weight" | "volume";
    operator: ">" | "<" | ">=" | "<=" | "=" | "!=";
    value: Double;
  };
  contact: {
    name: string;
    phone: string;
  };
  address: Address;
  remarks: string;
  createdAt: Date;
  updatedAt: Date;
};

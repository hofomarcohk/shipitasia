import { utils } from "@/cst/utils";
import { z } from "zod";
import { AddressSchema } from "./Address";
import {
  ApiTokenSchema,
  ExternalTokenSchema,
  NotifyApiSchema,
  YunExpressTokenSchema,
} from "./Api";

export type ClientStatus = "active" | "inactive" | "locked" | "deleted";
export type ClientRole = "admin" | "client" | "test";
export type PaymentMethod = "credit_card" | "bank_transfer" | "paypal";

export const PaymentSchema = z
  .object({
    paymentMethod: z.enum(
      Object.values(utils.PAYMENT_METHODS) as [string, ...string[]]
    ),
    cardNumber: z.string().regex(/^\d{16}$/),
    cardHolder: z.string(),
    cvv: z.string().regex(/^\d{3}$/),
    expiryDate: z.string().regex(/^\d{2}\/\d{2}$/),
  })
  .strict();

export const ClientSchema = z
  .object({
    username: z.string(),
    password: z.string(),
    status: z.string(),
    role: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    avatar: z.string().optional(),
    //    company: z.string(),
    email: z.string().email(),
    // langCode: z.string(),
    // theme: z.string().optional(),
    // is_email_enabled: z.boolean().default(false).optional(),
    //    is_api_enabled: z.boolean().default(false).optional(),

    addresses: AddressSchema.array(),
    payments: PaymentSchema.array(),
    externalTokens: z.array(
      z.union([YunExpressTokenSchema, ExternalTokenSchema])
    ),
    apiTokens: ApiTokenSchema.array(),
    notifyApis: NotifyApiSchema.array(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })
  .strict();

export type ClientContact = {
  name: string;
  phone: string;
};

export type Client = z.infer<typeof ClientSchema>;

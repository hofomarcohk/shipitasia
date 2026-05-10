import { z } from "zod";
import { AddressSchema } from "./Address";

export const warehouseSchema = z
  .object({
    warehouseCode: z.string(),
    name: z.string(),
    address: AddressSchema,
    deletedAt: z.date().optional(),
    createdAt: z.date().optional(),
    createdBy: z.string(),
    updatedAt: z.date().optional(),
    updatedBy: z.string(),
  })
  .strict();

export const locationSchema = z
  .object({
    locationId: z.string(),
    locationCode: z.string(),
    warehouseCode: z.string(),
    deletedAt: z.date().optional(),
    createdAt: z.date().optional(),
    createdBy: z.string(),
    updatedAt: z.date(),
    updatedBy: z.string(),
  })
  .strict();

export const itemLocationSchema = z
  .object({
    locationId: z.string(),
    itemType: z.string(),
    itemCode: z.string(),
    quantity: z.number(),
    isDeleted: z.boolean(),
    createdAt: z.date(),
    createdBy: z.string(),
    updatedAt: z.date(),
    updatedBy: z.string(),
  })
  .strict();

export const packStationSchema = z
  .object({
    code: z.string(),
    warehouseCode: z.string(),
    isDeleted: z.boolean(),
    createdAt: z.date(),
    createdBy: z.string(),
    updatedAt: z.date(),
    updatedBy: z.string(),
  })
  .strict();

export const palletSchema = z
  .object({
    palletId: z.string(),
    palletCode: z.string(),
    warehouseCode: z.string(),
    deletedAt: z.date().optional(),
    createdAt: z.date(),
    createdBy: z.string(),
    updatedAt: z.date(),
    updatedBy: z.string(),
  })
  .strict();

export const countrySchema = z
  .object({
    countryKey: z.string(),
    text: z.object({
      en: z.string(),
      zh_cn: z.string(),
      zh_hk: z.string(),
    }),
    deletedAt: z.date().optional(),
    createdAt: z.date().optional(),
    createdBy: z.string().optional(),
    updatedAt: z.date().optional(),
    updatedBy: z.string().optional(),
  })
  .strict();

export const categorySchema = z
  .object({
    categoryKey: z.string(),
    text: z.object({
      en: z.string(),
      zh_cn: z.string(),
      zh_hk: z.string(),
    }),
    deletedAt: z.date().optional(),
    createdAt: z.date().optional(),
    createdBy: z.string().optional(),
    updatedAt: z.date().optional(),
    updatedBy: z.string().optional(),
  })
  .strict();

export const restrictionSchema = z
  .object({
    restrictionKey: z.string(),
    text: z.object({
      en: z.string(),
      zh_cn: z.string(),
      zh_hk: z.string(),
    }),
    deletedAt: z.date().optional(),
    createdAt: z.date().optional(),
    createdBy: z.string().optional(),
    updatedAt: z.date().optional(),
    updatedBy: z.string().optional(),
  })
  .strict();

export type Warehouse = z.infer<typeof warehouseSchema>;
export type ItemLocation = z.infer<typeof itemLocationSchema>;
export type Location = z.infer<typeof locationSchema>;
export type PackStation = z.infer<typeof packStationSchema>;
export type Pallet = z.infer<typeof palletSchema>;
export type Country = z.infer<typeof countrySchema>;
export type Category = z.infer<typeof categorySchema>;
export type Restriction = z.infer<typeof restrictionSchema>;

import { z } from "zod";

export const AddressSchema = z.object({  
  contactPerson: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  address: z.string(),
  zip: z.string().nullable().optional(),
});

export type Address = z.infer<typeof AddressSchema>;
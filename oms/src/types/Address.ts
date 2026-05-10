import { z } from "zod";

export const AddressSchema = z.object({
  id: z.string().optional(),
  contactPerson: z.string(),
  mobile: z.string(),
  country: z.string(),
  region: z.string().optional(),
  state: z.string().optional(),
  city: z.string(),
  district: z.string(),
  address: z.string(),
  zip: z.string().optional(),
  isDefault: z.boolean().default(false).optional(),
});

export type Address = z.infer<typeof AddressSchema>;

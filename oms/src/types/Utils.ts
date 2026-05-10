import { z } from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type Alert = {
  type: string;
  message: string;
  time?: number;
};

export type OptionItem = {
  value: string;
  label: string;
};

export type OptionItemList = OptionItem[];

export const DimensionSchema = z.object({
  width: z.number().optional(),
  length: z.number().optional(),
  height: z.number().optional(),
  weight: z.number().optional(),
});
export type Dimension = z.infer<typeof DimensionSchema>;

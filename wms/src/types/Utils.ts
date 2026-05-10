import { Locale } from "next-intl";
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

export interface PageProps {
  params: Promise<{ locale: Locale; rest: string[] }>;
}

export type setData = (key: string, data: any) => void;
export type pushAlert = (alert: Alert) => void;
export type getModalDataByKey = (key: string) => any;

export type OptionItemList = OptionItem[];

export const DimensionSchema = z
  .object({
    width: z.number().optional(),
    length: z.number().optional(),
    height: z.number().optional(),
    weight: z.number().optional(),
  })
  .strict();
export type Dimension = z.infer<typeof DimensionSchema>;

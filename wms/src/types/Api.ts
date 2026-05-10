import { z } from "zod";

export const ApiReturnSchema = z.object({
  status: z.number(),
  sysCode: z.string().optional(),
  message: z.string(),
  data: z.any().optional(),
  isFile: z.boolean().optional(),
  headers: z.any().optional(),
});

export const ApiRetrySchema = z
  .object({
    requestId: z.string(),
    status: z.number(),
    retryCount: z.number(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export const ApiTokenSchema = z
  .object({
    title: z.string(),
    apiKey: z.string(),
    secretKey: z.string(),
  })
  .strict();

export const ExternalTokenSchema = z
  .object({
    name: z.string(),
    platform: z.string(),
    token: z.string(),
    expiredAt: z.date(),
  })
  .strict();

export const CmsApiSchema = z
  .object({
    method: z.string(),
    url: z.string(),
  })
  .strict();

export type ApiReturn = z.infer<typeof ApiReturnSchema>;
export type ApiRetry = z.infer<typeof ApiRetrySchema>;
export type CmsApi = z.infer<typeof CmsApiSchema>;
export type ExternalToken = z.infer<typeof ExternalTokenSchema>;
export type ApiToken = z.infer<typeof ApiTokenSchema>;

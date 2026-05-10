import { CRONJOB_LOG_STATUS } from "@/cst/log";
import { z } from "zod";
import { HttpMethod } from "./Utils";

export type ClientLog = {
  clientId: string;
  requestId: string;
  endpoint: string;
  method: HttpMethod;
  statusCode: number;
  responseTime: number;
  request: any;
  response: any;
  ipAddress: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
};

export type OutgoingApiLog = {
  requestId: string;
  staffId: string;
  method: string;
  url: string;
  status: number;
  headers: any;
  body: any;
  retry: number;
  responses: {
    status: number;
    usedTime: number;
    response: any;
    createdAt: Date;
  }[];
  createdAt?: Date;
};

export const CronjobLogSchema = z
  .object({
    jobName: z.string(),
    status: z.nativeEnum(CRONJOB_LOG_STATUS),
    message: z.string().optional(),
    trace: z.string().optional(),
    startAt: z.date().optional(),
    endAt: z.date().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })
  .strict();

export const incomingApiLogSchema = z
  .object({
    requestId: z.string(),
    username: z.string(),
    method: z.string(),
    url: z.string(),
    status: z.number(),
    usedTime: z.number(),
    headers: z.custom().optional(),
    body: z.custom().optional(),
    response: z.custom().optional(),
    ipAddress: z.string(),
    createdAt: z.date().optional(),
  })
  .strict();

export const moveLogSchema = z
  .object({
    itemCode: z.string(),
    itemType: z.string(),
    fromLocation: z.string(),
    toLocation: z.string(),
    quantity: z.number(),
    createdAt: z.date(),
    createdBy: z.string(),
  })
  .strict();

export const arrivalLogSchema = z
  .object({
    orderId: z.string(),
    staffId: z.string(),
    arrivedAt: z.date(),
    createdAt: z.date(),
  })
  .strict();

export const receiveLogSchema = z
  .object({
    orderId: z.string(),
    staffId: z.string(),
    warehouse: z.string(),
    locationCode: z.string(),
    receivedAt: z.date(),
    createdAt: z.date(),
  })
  .strict();

export type CronjobLog = z.infer<typeof CronjobLogSchema>;
export type IncomingApiLog = z.infer<typeof incomingApiLogSchema>;

export type CronjobLogStatus = z.infer<typeof CronjobLogSchema>["status"];
export type MoveLog = z.infer<typeof moveLogSchema>;
export type ArrivalLog = z.infer<typeof arrivalLogSchema>;
export type ReceiveLog = z.infer<typeof receiveLogSchema>;

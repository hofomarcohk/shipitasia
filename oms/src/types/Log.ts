import { HttpMethod } from "./Utils";

export type CronjobLogStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export type CronjobLog = {
  jobName: string;
  status: CronjobLogStatus;
  message?: string;
  trace?: string;
  startAt?: Date;
  endAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

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

export type IncomingApiLog = {
  requestId: string;
  username: string;
  method: string;
  url: string;
  status: number;
  usedTime: number;
  headers: any;
  body: any;
  response: any;
  ipAddress: string;
  createdAt?: Date;
}

export type OutgoingApiLog = {
  requestId: string;
  clientId: string;
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
}
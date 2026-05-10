import { collections } from "@/cst/collections";
import { CronjobLog } from "@/types/Log";
import { mongoAdd, mongoDelete, mongoEdit } from "../utils/mongodb";

const collection = collections.CRONJOB_LOG;

export async function addCronLog(data: CronjobLog) {
  data.createdAt = new Date();
  return await mongoAdd(collection, data);
}
export async function editCronLog(condition: any, data: CronjobLog) {
  delete data.createdAt;
  data.updatedAt = new Date();
  return await mongoEdit(collection, condition, { $set: data });
}

export async function newCronLog(jobName: string) {
  await addCronLog({
    jobName,
    status: "pending",
    createdAt: new Date(),
  });
}
export async function startCronLog(jobName: string) {
  const condition = {
    jobName,
    status: "pending",
  };
  const now = new Date();
  return await editCronLog(condition, {
    jobName,
    status: "processing",
    startAt: now,
  });
}

export async function completeCronLog(jobName: string) {
  const condition = {
    jobName,
    status: "processing",
  };
  const now = new Date();
  return await editCronLog(condition, {
    jobName,
    message: "success",
    status: "completed",
    endAt: now,
  });
}
export async function failCronLog(jobName: string, e: any) {
  const condition = {
    jobName,
    status: "processing",
  };
  const now = new Date();
  return await editCronLog(condition, {
    jobName,
    message: e.message,
    status: "failed",
    endAt: now,
    trace: e.stack,
  });
}

export async function removePendingCronLog() {
  const condition = {
    status: "pending",
  };
  return await mongoDelete(collection, condition);
}

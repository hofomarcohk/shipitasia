import {
  completeCronLog,
  failCronLog,
  newCronLog,
  removePendingCronLog,
  startCronLog,
} from "@/services/cron/handle_cron_log";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";
import cron from "node-cron";
import { apiMiddleware } from "./api-middleware";
import { tasks } from "./tasks";

const scheduledTasks = await (async () => {
  const scheduledTasks = [];
  for (const task of tasks) {
    let jobName = task[1];
    const handler = async () => {
      await startCronLog(jobName);
      try {
        await task[2]();
        await completeCronLog(jobName);
      } catch (error) {
        await failCronLog(jobName, error);
      }
      await newCronLog(jobName);
    };
    scheduledTasks.push({
      jobName,
      task: cron.schedule(task[0], handler, {
        scheduled: false,
      }),
    });
  }
  return scheduledTasks;
})();

export async function POST(request: NextRequest) {
  return apiMiddleware(request, null, async (): Promise<ApiReturn> => {
    if (process.env.ENABLE_CRON === "true") {
      await removePendingCronLog();
      for (const scheduledTask of scheduledTasks) {
        const jobName = scheduledTask.jobName;
        await newCronLog(jobName);
        scheduledTask.task.stop();
        scheduledTask.task.start();
      }
    }
    return {
      status: 200,
      message: "Success",
    };
  });
}

export async function DELETE(request: NextRequest) {
  return apiMiddleware(request, null, async (): Promise<ApiReturn> => {
    if (process.env.ENABLE_CRON === "true") {
      for (const scheduledTask of scheduledTasks) {
        scheduledTask.task.stop();
      }
    }
    return {
      status: 200,
      message: "Success",
    };
  });
}

import { apiRetryCronjob } from "@/services/cron/handle_api_retry";

export const tasks: [string, string, () => void][] = [
  // every 15min
  ["*/15 * * * *", "apiRetryCronjob", apiRetryCronjob],
];

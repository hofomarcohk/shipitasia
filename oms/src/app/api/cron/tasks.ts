import { apiRetryCronjob } from "@/services/cron/handle_api_retry";
import { sweepManagedConsignGroups } from "@/services/consolidation/sweep";

export const tasks: [string, string, () => void][] = [
  // every 15min
  ["*/15 * * * *", "apiRetryCronjob", apiRetryCronjob],
  // P15 — daily managed_consign sweep at 02:00 local. Fires the auto-
  // outbound for groups whose 3-working-day SLA has elapsed and processes
  // any force_released groups regardless of SLA.
  ["0 2 * * *", "sweepManagedConsignGroups", sweepManagedConsignGroups],
];

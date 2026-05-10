import { ApiError } from "@/app/api/api-error";
import { getLogisticPartyMap } from "./get_logistic_party_list";

export async function validateLogisticPlatform(logisticPartyCodes: string[]) {
  logisticPartyCodes = [...new Set(logisticPartyCodes)];
  const logisticPartyMap = await getLogisticPartyMap([
    {
      $match: {
        logisticPartyCode: { $in: logisticPartyCodes },
        deletedAt: { $exists: false },
      },
    },
  ]);
  const invalidLogisticPartyCodes = logisticPartyCodes.filter(
    (code) => !logisticPartyMap[code]
  );
  if (invalidLogisticPartyCodes.length > 0) {
    throw new ApiError("INVALID_LOGISTIC_PARTY", {
      code: invalidLogisticPartyCodes.join(", "),
    });
  }
}

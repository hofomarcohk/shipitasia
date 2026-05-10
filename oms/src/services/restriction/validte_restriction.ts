import { ApiError } from "@/app/api/api-error";
import { getRestrictionMap } from "./get_restriction_list";

export async function validateRestrictionKey(restrictionKeys: string[]) {
  restrictionKeys = [...new Set(restrictionKeys)];
  const restrictionMap = await getRestrictionMap([
    {
      $match: {
        restrictionKey: { $in: restrictionKeys },
        deletedAt: { $exists: false },
      },
    },
  ]);
  const invalidRestrictionKeys = restrictionKeys.filter(
    (code) => code !== "" && !restrictionMap[code]
  );
  if (invalidRestrictionKeys.length > 0) {
    throw new ApiError("INVALID_RESTRICTION_KEY", {
      code: invalidRestrictionKeys.join(", "),
    });
  }
}

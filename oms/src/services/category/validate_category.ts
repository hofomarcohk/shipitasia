import { ApiError } from "@/app/api/api-error";
import { getCategoryMap } from "./get_category_list";

export async function validateCategoryKey(categoryKeys: string[]) {
  categoryKeys = [...new Set(categoryKeys)];
  const categoryMap = await getCategoryMap([
    {
      $match: {
        categoryKey: { $in: categoryKeys },
        deletedAt: { $exists: false },
      },
    },
  ]);
  const invalidCategoryKey = categoryKeys.filter(
    (code) => code !== "" && !categoryMap[code]
  );
  if (invalidCategoryKey.length > 0) {
    throw new ApiError("INVALID_CATEGORY_KEY", {
      code: invalidCategoryKey.join(", "),
    });
  }
}

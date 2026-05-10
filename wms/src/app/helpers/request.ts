import { utils } from "@/cst/utils";

const langCode = (lang: any) => {
  const langCode = lang.replace("-", "_");
  return utils.LANG_CODES.includes(langCode) ? langCode : "en";
};
export { langCode };

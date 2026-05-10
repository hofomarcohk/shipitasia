import { INBOUND_ERROR } from "@/cst/errors/inbound-error";
import { ACCOUNT_ERROR } from "./errors/account-error";
import { COMMON_ERROR } from "./errors/common-error";
import { OUTBOUND_ERROR } from "./errors/outbound-error";

export const ApiErrorList = {
  ...COMMON_ERROR,
  ...ACCOUNT_ERROR, // 10
  ...INBOUND_ERROR, // 11
  ...OUTBOUND_ERROR, // 12
  // BILL // 13
  // TOOL // 14
};

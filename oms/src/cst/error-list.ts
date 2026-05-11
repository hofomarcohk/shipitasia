import { INBOUND_ERROR } from "@/cst/errors/inbound-error";
import { ACCOUNT_ERROR } from "./errors/account-error";
import { CARRIER_ERROR } from "./errors/carrier-error";
import { COMMON_ERROR } from "./errors/common-error";
import { OUTBOUND_ERROR } from "./errors/outbound-error";
import { SCAN_ERROR } from "./errors/scan-error";
import { WALLET_ERROR } from "./errors/wallet-error";

export const ApiErrorList = {
  ...COMMON_ERROR,
  ...ACCOUNT_ERROR, // 10
  ...INBOUND_ERROR, // 11
  ...OUTBOUND_ERROR, // 12
  ...WALLET_ERROR, // 13 (reuses the BILL slot; v1 wallet replaces legacy bills)
  ...CARRIER_ERROR, // 14
  ...SCAN_ERROR, // 15
};

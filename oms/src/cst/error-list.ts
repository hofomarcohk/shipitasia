import { INBOUND_ERROR } from "@/cst/errors/inbound-error";
import { ACCOUNT_ERROR } from "./errors/account-error";
import { CARRIER_ERROR } from "./errors/carrier-error";
import { COMMON_ERROR } from "./errors/common-error";
import { OUTBOUND_ERROR } from "./errors/outbound-error";
import { OUTBOUND_CREATION_ERROR } from "./errors/outbound-creation-error";
import { OUTBOUND_WMS_ERROR } from "./errors/outbound-wms-error";
import { SCAN_ERROR } from "./errors/scan-error";
import { UNCLAIMED_ERROR } from "./errors/unclaimed-error";
import { WALLET_ERROR } from "./errors/wallet-error";

export const ApiErrorList = {
  ...COMMON_ERROR,
  ...ACCOUNT_ERROR, // 10
  ...INBOUND_ERROR, // 11
  ...OUTBOUND_ERROR, // 12 (legacy from inherited)
  ...WALLET_ERROR, // 13 (reuses the BILL slot; v1 wallet replaces legacy bills)
  ...CARRIER_ERROR, // 14
  ...SCAN_ERROR, // 15
  ...UNCLAIMED_ERROR, // 16
  ...OUTBOUND_CREATION_ERROR, // 17 (P7 outbound v1)
  ...OUTBOUND_WMS_ERROR, // 18 (P8 WMS outbound flow)
};

import { INBOUND_ERROR } from "@/cst/errors/inbound-error";
import { INVENTORY_ERROR } from "@/cst/errors/inventory-error";
import { OUTBOUND_ERROR } from "./errors/outbound-error";

export const ApiErrorList = {
  // 99: Common Error / System Error
  INTERNAL_SERVER_ERROR: {
    status: 500,
    sys_code: "9900000", // 99: Common Error, 0: Internal Error, 0000: Error no
    message: "Internal Server Error",
    en: "Internal Server Error",
    zh_hk: "內部伺服器錯誤",
    zh_cn: "内部服务器错误",
  },
  UNAUTHORIZED: {
    status: 401,
    sys_code: "9900001",
    message: "Unauthorized",
    en: "Unauthorized",
    zh_hk: "未能取得帳號資訊",
    zh_cn: "未能取得帐号信息",
  },
  INVALID_CREDENTIALS: {
    status: 401,
    sys_code: "9900002",
    message: "Invalid credentials",
    en: "Invalid credentials",
    zh_hk: "無效的憑證",
    zh_cn: "无效的凭证",
  },
  FORBIDDEN: {
    status: 403,
    sys_code: "9900003",
    message: "Forbidden",
    en: "Forbidden",
    zh_hk: "禁止",
    zh_cn: "禁止",
  },
  NOT_IMPLEMENTED: {
    status: 501,
    sys_code: "9900004",
    message: "Not Implemented",
    en: "Not Implemented",
    zh_hk: "未實現",
    zh_cn: "未实现",
  },
  MISSING_FIELD: {
    status: 400,
    sys_code: "9900005",
    message: "Missing Field: {field}",
    en: "Missing Field: {field}",
    zh_hk: "請輸入: {field}",
    zh_cn: "请输入: {field}",
  },
  RECORD_DUPLICATE: {
    status: 400,
    sys_code: "9900006",
    message: "Record already exists: {key}",
    en: "Record already exists: {key}",
    zh_hk: "記錄已存在: {key}",
    zh_cn: "记录已存在: {key}",
  },
  INVALID_FIELD: {
    status: 400,
    sys_code: "9900008",
    message: "Invalid Field: {field}",
    en: "Invalid Field: {field}",
    zh_hk: "無效字段: {field}",
    zh_cn: "无效字段: {field}",
  },
  RECORD_NOT_FOUND: {
    status: 400,
    sys_code: "9900009",
    message: "Record not found",
    en: "Record not found",
    zh_hk: "找不到記錄",
    zh_cn: "找不到记录",
  },
  STATUS_404: {
    status: 404,
    sys_code: "9900010",
    message: "Not Found",
    en: "Not Found",
    zh_hk: "無法找到資源",
    zh_cn: "无法找到资源",
  },

  ...INVENTORY_ERROR, //  10
  ...INBOUND_ERROR, //  20
  ...OUTBOUND_ERROR, //   30
};

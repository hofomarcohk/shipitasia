export const INBOUND_ERROR = {
  INBOUND_NOT_CANCELABLE: {
    status: 400,
    sys_code: "1100001", // 11: Inbound Error, 0: Internal Error, 0000: Error no
    message: "Inbound not cancelable",
    en: "That inbound order is not cancelable",
    zh_hk: "該入庫單處於不能取消的狀態",
    zh_cn: "该入库单处于不能取消的状态",
  },
  INVALID_INBOUND_STATUS: {
    status: 400,
    sys_code: "1100002",
    message: "Invalid Inbound Status: {status}",
    en: "Invalid Inbound Status: {status}",
    zh_hk: "無效的入庫狀態: {status}",
    zh_cn: "无效的入库状态: {status}",
  },
  ADDRESS_NOT_FOUND: {
    status: 400,
    sys_code: "1100002",
    message: "Address not found",
    en: "Address not found",
    zh_hk: "找不到地址",
    zh_cn: "找不到地址",
  },

  FAIL_TO_CREATE_OUTBOUND_ORDER: {
    status: 400,
    sys_code: "1100003",
    message: "Unable to create Orders: {error}",
    en: "Unable to create Orders: {error}",
    zh_hk: "無法生成出庫訂單: {error}",
    zh_cn: "无法生成出库订单: {error}",
  },

  MISSING_DECLARED_VALUE: {
    status: 400,
    sys_code: "1100004",
    message: "Missing Declared Value",
    en: "Missing Declared Value",
    zh_hk: "請輸入申報價值",
    zh_cn: "请输入申报价值",
  },

  MISSING_CATEGORY: {
    status: 400,
    sys_code: "1100005",
    message: "Missing Category",
    en: "Missing Category",
    zh_hk: "請選擇類別",
    zh_cn: "请选择类别",
  },
};

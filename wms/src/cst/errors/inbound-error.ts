export const INBOUND_ERROR = {
  INBOUND_NOT_CANCELABLE: {
    status: 500,
    sys_code: "2000001", // 20: Inbound Error, 0: Internal Error, 0000: Error no
    message: "Inbound not cancelable",
    en: "That inbound order is not cancelable",
    zh_hk: "該入庫單處於不能取消的狀態",
    zh_cn: "该入库单处于不能取消的状态",
  },

  INBOUND_NOT_RECEIVABLE: {
    status: 500,
    sys_code: "2000002",
    message: "Inbound not receivable",
    en: "That inbound order is not receivable",
    zh_hk: "該入庫單處於不能入庫的狀態",
    zh_cn: "该入库单处于不能入库的状态",
  },
};

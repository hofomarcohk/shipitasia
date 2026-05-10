export const OUTBOUND_ERROR = {
  // 30: General Outbound Error, 0: Internal Error, 0000: Error no
  OUTBOUND_NOT_FOUND: {
    status: 500,
    sys_code: "3000000", // 31: Pick Error, 0: Internal Error, 0000: Error no
    message: "Outbound Request not found",
    en: "Outbound Request not found",
    zh_hk: "出庫訂單不存在",
    zh_cn: "出库订单不存在",
  },

  // 31: Pick Error, 0: Internal Error, 0000: Error no
  PICK_LIST_NOT_FOUND: {
    status: 500,
    sys_code: "3100001", // 31: Pick Error, 0: Internal Error, 0000: Error no
    message: "Pick list not found",
    en: "Pick list not found",
    zh_hk: "提貨清單不存在",
    zh_cn: "拣货清单不存在",
  },

  ITEM_PICKED_ALREADY: {
    status: 400,
    sys_code: "3100002",
    message: "Item picked already",
    en: "Item picked already",
    zh_hk: "物品已被提取",
    zh_cn: "物品已被提取",
  },

  // 32: Packing Error, 0: Internal Error, 0000: Error no
  OUTBOUND_NOT_PICKED: {
    status: 400,
    sys_code: "3200001",
    message: "Outbound Request not picked",
    en: "Outbound Request not picked",
    zh_hk: "出庫訂單尚未完成提貨",
    zh_cn: "出库订单尚未完成拣货",
  },

  OUTBOUND_PACKED: {
    status: 400,
    sys_code: "3200002",
    message: "Outbound Request already packed",
    en: "Outbound Request already packed",
    zh_hk: "出庫訂單已完成包裝",
    zh_cn: "出库订单已完成打包",
  },

  OUTBOUND_NOT_PACKING: {
    status: 400,
    sys_code: "3200003",
    message: "Outbound Request not in packing status",
    en: "Outbound Request not in packing status",
    zh_hk: "出庫訂單不在包裝狀態",
    zh_cn: "出库订单不在打包状态",
  },

  // 33: Palletize Error, 0: Internal Error, 0000: Error no
  BOX_NOT_FOUND: {
    status: 400,
    sys_code: "3300001",
    message: "Box not found",
    en: "Box not found: {boxNo}",
    zh_hk: "箱子不存在: {boxNo}",
    zh_cn: "箱子不存在: {boxNo}",
  },

  // 34: Departure Error, 0: Internal Error, 0000: Error no
  PALLET_NOT_FOUND: {
    status: 400,
    sys_code: "3400001",
    message: "Pallet not found",
    en: "Pallet not found: {palletCode}",
    zh_hk: "卡板不存在: {palletCode}",
    zh_cn: "卡板不存在: {palletCode}",
  },
  PALLET_ALREADY_DEPARTED: {
    status: 400,
    sys_code: "3400002",
    message: "Pallet already departed",
    en: "Pallet already departed: {palletCode}",
    zh_hk: "卡板已出庫: {palletCode}",
    zh_cn: "卡板已出库: {palletCode}",
  },
};

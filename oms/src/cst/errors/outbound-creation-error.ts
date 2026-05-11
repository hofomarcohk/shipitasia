// Phase 7 — outbound creation + rate quote + label errors. sys_code prefix 1700xxx.
// Separated from legacy OUTBOUND_ERROR (12xxxxx slot, inherited code) to keep
// v1 state-machine and gating semantics from colliding with legacy codes.
export const OUTBOUND_CREATION_ERROR = {
  // ── input / lookup ─────────────────────────────────────────
  OUTBOUND_REQUEST_NOT_FOUND: {
    status: 404,
    sys_code: "1700001",
    message: "Outbound request not found: {orderId}",
    en: "Outbound request not found: {orderId}",
    zh_hk: "找不到出庫單: {orderId}",
    zh_cn: "找不到出库单: {orderId}",
  },
  OUTBOUND_INVALID_STATUS: {
    status: 400,
    sys_code: "1700002",
    message: "Outbound request status does not permit this action: {status}",
    en: "Outbound request status does not permit this action: {status}",
    zh_hk: "出庫單狀態不允許此操作: {status}",
    zh_cn: "出库单状态不允许此操作: {status}",
  },
  INBOUND_NOT_RECEIVED: {
    status: 400,
    sys_code: "1700003",
    message: "Inbound must be received before outbound: {inboundIds}",
    en: "Inbound must be received before outbound: {inboundIds}",
    zh_hk: "入庫單需先簽收方可出庫: {inboundIds}",
    zh_cn: "入库单需先签收方可出库: {inboundIds}",
  },
  INBOUND_ALREADY_IN_ACTIVE_OUTBOUND: {
    status: 400,
    sys_code: "1700004",
    message: "Inbound is already in an active outbound: {inboundIds}",
    en: "Inbound is already in an active outbound: {inboundIds}",
    zh_hk: "入庫單已綁定其他進行中出庫: {inboundIds}",
    zh_cn: "入库单已绑定其他进行中出库: {inboundIds}",
  },
  INBOUND_OWNERSHIP_MISMATCH: {
    status: 403,
    sys_code: "1700005",
    message: "Inbound does not belong to this client: {inboundIds}",
    en: "Inbound does not belong to this client: {inboundIds}",
    zh_hk: "入庫單非此客戶所有: {inboundIds}",
    zh_cn: "入库单非此客户所有: {inboundIds}",
  },
  EMPTY_INBOUND_LIST: {
    status: 400,
    sys_code: "1700006",
    message: "At least one inbound must be selected",
    en: "At least one inbound must be selected",
    zh_hk: "請選擇至少一張入庫單",
    zh_cn: "请选择至少一张入库单",
  },
  SINGLE_REQUIRES_ONE_INBOUND: {
    status: 400,
    sys_code: "1700007",
    message: "Single shipment must contain exactly one inbound",
    en: "Single shipment must contain exactly one inbound",
    zh_hk: "直走出庫只可包含一張入庫單",
    zh_cn: "直走出库只可包含一张入库单",
  },

  // ── carrier / rate quote ───────────────────────────────────
  CARRIER_NOT_ENABLED: {
    status: 400,
    sys_code: "1700010",
    message: "Carrier is not enabled: {code}",
    en: "Carrier is not enabled: {code}",
    zh_hk: "物流商未啟用: {code}",
    zh_cn: "物流商未启用: {code}",
  },
  CARRIER_ACCOUNT_REQUIRED: {
    status: 400,
    sys_code: "1700011",
    message: "Carrier account required for {code}; client must bind first",
    en: "Carrier account required for {code}; client must bind first",
    zh_hk: "物流商 {code} 需先綁定客戶帳號",
    zh_cn: "物流商 {code} 需先绑定客户账号",
  },
  CARRIER_DESTINATION_UNSUPPORTED: {
    status: 400,
    sys_code: "1700012",
    message: "Carrier {code} does not serve country: {country}",
    en: "Carrier {code} does not serve country: {country}",
    zh_hk: "物流商 {code} 不支援目的地: {country}",
    zh_cn: "物流商 {code} 不支持目的地: {country}",
  },
  RATE_QUOTE_FAILED: {
    status: 500,
    sys_code: "1700013",
    message: "Failed to obtain rate quote from carrier: {reason}",
    en: "Failed to obtain rate quote from carrier: {reason}",
    zh_hk: "無法取得運費報價: {reason}",
    zh_cn: "无法取得运费报价: {reason}",
  },
  CAPACITY_VIOLATION: {
    status: 400,
    sys_code: "1700014",
    message: "Shipment violates carrier capacity rules: {detail}",
    en: "Shipment violates carrier capacity rules: {detail}",
    zh_hk: "出庫違反物流商容量限制: {detail}",
    zh_cn: "出库违反物流商容量限制: {detail}",
  },

  // ── balance / wallet gate ──────────────────────────────────
  INSUFFICIENT_BALANCE: {
    status: 400,
    sys_code: "1700020",
    message: "Insufficient wallet balance; need {required}, have {available}",
    en: "Insufficient wallet balance; need {required}, have {available}",
    zh_hk: "錢包餘額不足，需 {required}，可用 {available}",
    zh_cn: "钱包余额不足，需 {required}，可用 {available}",
  },

  // ── label ──────────────────────────────────────────────────
  WEIGHT_NOT_VERIFIED: {
    status: 400,
    sys_code: "1700030",
    message: "Weight must be verified before fetching label",
    en: "Weight must be verified before fetching label",
    zh_hk: "出庫需先完成稱重才可申請面單",
    zh_cn: "出库需先完成称重才可申请面单",
  },
  ALREADY_HAS_LABEL: {
    status: 400,
    sys_code: "1700031",
    message: "Outbound already has a label",
    en: "Outbound already has a label",
    zh_hk: "出庫已有面單",
    zh_cn: "出库已有面单",
  },
  LABEL_FETCH_FAILED: {
    status: 500,
    sys_code: "1700032",
    message: "Failed to fetch label from carrier: {reason}",
    en: "Failed to fetch label from carrier: {reason}",
    zh_hk: "無法從物流商取得面單: {reason}",
    zh_cn: "无法从物流商取得面单: {reason}",
  },

  // ── state machine ──────────────────────────────────────────
  CANNOT_CANCEL_IN_CURRENT_STATUS: {
    status: 400,
    sys_code: "1700040",
    message: "Cannot cancel outbound in status {status}",
    en: "Cannot cancel outbound in status {status}",
    zh_hk: "{status} 狀態下無法取消出庫",
    zh_cn: "{status} 状态下无法取消出库",
  },
  CANNOT_RELEASE_NOT_HELD: {
    status: 400,
    sys_code: "1700041",
    message: "Outbound is not held; cannot release",
    en: "Outbound is not held; cannot release",
    zh_hk: "出庫並非保留狀態，無需解除",
    zh_cn: "出库并非保留状态，无需解除",
  },

  // ── processing preference ─────────────────────────────────
  PROCESSING_PREFERENCE_INVALID_FOR_SINGLE: {
    status: 400,
    sys_code: "1700050",
    message: "Single shipment must use 'auto' processing preference",
    en: "Single shipment must use 'auto' processing preference",
    zh_hk: "直走出庫只可使用 auto 處理模式",
    zh_cn: "直走出库只可使用 auto 处理模式",
  },
};

// Phase 10 — pick batch + pallet label errors. sys_code prefix 2000xxx.
export const PICK_BATCH_ERROR = {
  // ── pick batch ─────────────────────────────────────────────
  PICK_BATCH_NOT_FOUND: {
    status: 404,
    sys_code: "2000001",
    message: "Pick batch not found: {batchId}",
    en: "Pick batch not found: {batchId}",
    zh_hk: "找不到揀貨批次 {batchId}",
    zh_cn: "找不到拣货批次 {batchId}",
  },
  PICK_BATCH_INVALID_STATUS: {
    status: 400,
    sys_code: "2000002",
    message: "Pick batch in {status} status cannot perform this action",
    en: "Pick batch in {status} status cannot perform this action",
    zh_hk: "批次 {status} 狀態下無法執行此操作",
    zh_cn: "批次 {status} 状态下无法执行此操作",
  },
  PICK_BATCH_EMPTY: {
    status: 400,
    sys_code: "2000003",
    message: "Pick batch must contain at least one outbound",
    en: "Pick batch must contain at least one outbound",
    zh_hk: "揀貨批次至少需包含一張出庫單",
    zh_cn: "拣货批次至少需包含一张出库单",
  },
  OUTBOUND_NOT_BATCHABLE: {
    status: 400,
    sys_code: "2000004",
    message: "Outbound {outboundId} cannot be added (status={status})",
    en: "Outbound {outboundId} cannot be added (status={status})",
    zh_hk: "出庫單 {outboundId} 狀態 {status}，無法加入批次",
    zh_cn: "出库单 {outboundId} 状态 {status}，无法加入批次",
  },
  OUTBOUND_ALREADY_IN_BATCH: {
    status: 400,
    sys_code: "2000005",
    message: "Outbound {outboundId} is already in batch {batchId}",
    en: "Outbound {outboundId} is already in batch {batchId}",
    zh_hk: "出庫單 {outboundId} 已在批次 {batchId} 中",
    zh_cn: "出库单 {outboundId} 已在批次 {batchId} 中",
  },
  PICK_BATCH_NOT_ACTIVE: {
    status: 400,
    sys_code: "2000006",
    message: "Pick batch {batchId} is not active",
    en: "Pick batch {batchId} is not active",
    zh_hk: "揀貨批次 {batchId} 未啟動",
    zh_cn: "拣货批次 {batchId} 未启动",
  },
  OUTBOUND_NOT_IN_ACTIVE_BATCH: {
    status: 400,
    sys_code: "2000007",
    message:
      "Outbound {outboundId} is not in an active batch; start a batch first",
    en: "Outbound {outboundId} is not in an active batch; start a batch first",
    zh_hk: "出庫單 {outboundId} 不在已啟動的批次內，請先開始批次",
    zh_cn: "出库单 {outboundId} 不在已启动的批次内，请先开始批次",
  },

  // ── pallet label ───────────────────────────────────────────
  PALLET_LABEL_NOT_FOUND: {
    status: 404,
    sys_code: "2000020",
    message: "Pallet label {palletNo} not found",
    en: "Pallet label {palletNo} not found",
    zh_hk: "找不到板位 {palletNo}",
    zh_cn: "找不到板位 {palletNo}",
  },
  PALLET_LABEL_OUTBOUND_NOT_READY: {
    status: 400,
    sys_code: "2000021",
    message:
      "Outbound {outboundId} is in {status}; pallet label cannot be printed",
    en: "Outbound {outboundId} is in {status}; pallet label cannot be printed",
    zh_hk: "出庫單 {outboundId} 為 {status} 狀態，無法生成板位 label",
    zh_cn: "出库单 {outboundId} 为 {status} 状态，无法生成板位 label",
  },
};

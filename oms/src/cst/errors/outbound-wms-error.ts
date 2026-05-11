// Phase 8 — WMS outbound flow errors. sys_code prefix 1800xxx.
// Kept separate from P7 OUTBOUND_CREATION_ERROR (slot 17) so wms-specific
// codes don't collide.
export const OUTBOUND_WMS_ERROR = {
  // ── pick stage ─────────────────────────────────────────────
  OUTBOUND_NOT_AVAILABLE_FOR_PICK: {
    status: 400,
    sys_code: "1800001",
    message: "Outbound is not available for pick: {status}",
    en: "Outbound is not available for pick: {status}",
    zh_hk: "出庫單 {status} 狀態下無法揀貨",
    zh_cn: "出库单 {status} 状态下无法拣货",
  },
  INBOUND_NOT_IN_OUTBOUND: {
    status: 400,
    sys_code: "1800002",
    message: "Inbound {inboundId} does not belong to outbound {outboundId}",
    en: "Inbound {inboundId} does not belong to outbound {outboundId}",
    zh_hk: "入庫單 {inboundId} 不在出庫單 {outboundId} 內",
    zh_cn: "入库单 {inboundId} 不在出库单 {outboundId} 内",
  },
  INBOUND_ALREADY_PICKED: {
    status: 400,
    sys_code: "1800003",
    message: "Inbound is already picked: {inboundIds}",
    en: "Inbound is already picked: {inboundIds}",
    zh_hk: "入庫單已揀過: {inboundIds}",
    zh_cn: "入库单已拣过: {inboundIds}",
  },
  LOCATION_MISMATCH: {
    status: 400,
    sys_code: "1800004",
    message: "Location mismatch: scanned {scanned}, expected {expected}",
    en: "Location mismatch: scanned {scanned}, expected {expected}",
    zh_hk: "庫位不符：掃描 {scanned}，預期 {expected}",
    zh_cn: "库位不符：扫描 {scanned}，预期 {expected}",
  },

  // ── pack stage ─────────────────────────────────────────────
  OUTBOUND_NOT_AVAILABLE_FOR_PACK: {
    status: 400,
    sys_code: "1800010",
    message: "Outbound is not available for pack: {status}",
    en: "Outbound is not available for pack: {status}",
    zh_hk: "出庫單 {status} 狀態下無法裝箱",
    zh_cn: "出库单 {status} 状态下无法装箱",
  },
  INBOUND_NOT_PICKED: {
    status: 400,
    sys_code: "1800011",
    message: "Inbound must be picked before pack: {inboundIds}",
    en: "Inbound must be picked before pack: {inboundIds}",
    zh_hk: "入庫單需先揀貨才可裝箱: {inboundIds}",
    zh_cn: "入库单需先拣货才可装箱: {inboundIds}",
  },
  INBOUND_ALREADY_BOXED: {
    status: 400,
    sys_code: "1800012",
    message: "Inbound is already boxed: {inboundIds}",
    en: "Inbound is already boxed: {inboundIds}",
    zh_hk: "入庫單已裝進其他箱: {inboundIds}",
    zh_cn: "入库单已装进其他箱: {inboundIds}",
  },
  NOT_ALL_INBOUNDS_BOXED: {
    status: 400,
    sys_code: "1800013",
    message: "Not all inbounds are boxed yet",
    en: "Not all inbounds are boxed yet",
    zh_hk: "仍有入庫單未裝進任何箱",
    zh_cn: "仍有入库单未装进任何箱",
  },
  EMPTY_BOX_INBOUND_LIST: {
    status: 400,
    sys_code: "1800014",
    message: "Box must contain at least one inbound",
    en: "Box must contain at least one inbound",
    zh_hk: "每箱至少需裝一張入庫單",
    zh_cn: "每箱至少需装一张入库单",
  },

  // ── weigh stage ────────────────────────────────────────────
  OUTBOUND_NOT_AVAILABLE_FOR_WEIGH: {
    status: 400,
    sys_code: "1800020",
    message: "Outbound is not available for weigh: {status}",
    en: "Outbound is not available for weigh: {status}",
    zh_hk: "出庫單 {status} 狀態下無法複重",
    zh_cn: "出库单 {status} 状态下无法复重",
  },
  BOX_NOT_FOUND: {
    status: 404,
    sys_code: "1800021",
    message: "Box not found: {boxNo}",
    en: "Box not found: {boxNo}",
    zh_hk: "找不到箱號 {boxNo}",
    zh_cn: "找不到箱号 {boxNo}",
  },
  BOX_NOT_AVAILABLE_FOR_WEIGH: {
    status: 400,
    sys_code: "1800022",
    message: "Box is not available for weigh: {status}",
    en: "Box is not available for weigh: {status}",
    zh_hk: "箱 {status} 狀態下無法複重",
    zh_cn: "箱 {status} 状态下无法复重",
  },
  BOX_COUNT_MISMATCH: {
    status: 400,
    sys_code: "1800023",
    message:
      "Box count mismatch: weighed {weighed}, registered {registered}",
    en: "Box count mismatch: weighed {weighed}, registered {registered}",
    zh_hk: "箱數對不上：量了 {weighed}，登記 {registered}",
    zh_cn: "箱数对不上：量了 {weighed}，登记 {registered}",
  },
  WEIGHT_TOLERANCE_EXCEEDED_NO_OVERRIDE: {
    status: 400,
    sys_code: "1800024",
    message:
      "Weight difference {diff}kg exceeds tolerance {tol}kg; override required",
    en: "Weight difference {diff}kg exceeds tolerance {tol}kg; override required",
    zh_hk: "重量差 {diff}kg 超過容差 {tol}kg，需員工確認 override",
    zh_cn: "重量差 {diff}kg 超过容差 {tol}kg，需员工确认 override",
  },

  // ── label stage ────────────────────────────────────────────
  OUTBOUND_NOT_AVAILABLE_FOR_LABEL: {
    status: 400,
    sys_code: "1800030",
    message: "Outbound is not available for label: {status}",
    en: "Outbound is not available for label: {status}",
    zh_hk: "出庫單 {status} 狀態下無法取運單",
    zh_cn: "出库单 {status} 状态下无法取运单",
  },
  OUTBOUND_NOT_AVAILABLE_FOR_PRINT: {
    status: 400,
    sys_code: "1800031",
    message: "Outbound is not available for label print: {status}",
    en: "Outbound is not available for label print: {status}",
    zh_hk: "出庫單 {status} 狀態下無法列印面單",
    zh_cn: "出库单 {status} 状态下无法列印面单",
  },

  // ── depart stage ───────────────────────────────────────────
  BOX_NOT_AVAILABLE_FOR_DEPART: {
    status: 400,
    sys_code: "1800040",
    message: "Box is not available for depart: {status}",
    en: "Box is not available for depart: {status}",
    zh_hk: "箱 {status} 狀態下無法離倉",
    zh_cn: "箱 {status} 状态下无法离仓",
  },
  BOX_ALREADY_DEPARTED: {
    status: 400,
    sys_code: "1800041",
    message: "Box has already departed",
    en: "Box has already departed",
    zh_hk: "此箱已離倉",
    zh_cn: "此箱已离仓",
  },
};

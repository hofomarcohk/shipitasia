export const PACK = {
  STATUS: {
    OPEN: "open",
    SEALED: "sealed",
    CANCELLED: "cancelled",
  } as const,
  // 集運箱無件數上限（以物理空間為準），保留一個 sentinel 避免越界
  DEFAULT_MAX_SLOTS: 999,
  SINGLE_DIRECT_MAX_SLOTS: 1,
} as const;

export const buildBoxNo = (clientCode: string, seq: number) =>
  `BOX-${clientCode}-${String(seq).padStart(3, "0")}`;

export const PACK = {
  STATUS: {
    OPEN: "open",
    SEALED: "sealed",
    CANCELLED: "cancelled",
  } as const,
  DEFAULT_MAX_SLOTS: 8,
  SINGLE_DIRECT_MAX_SLOTS: 1,
} as const;

export const buildBoxNo = (clientCode: string, seq: number) =>
  `BOX-${clientCode}-${String(seq).padStart(3, "0")}`;

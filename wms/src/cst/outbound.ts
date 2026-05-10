import { lang } from "@/lang/base";

export const OUTBOUND = {
  STATUS: {
    PENDING: "pending",
    PICKING: "picking",
    PICKED: "picked",
    PACKING: "packing",
    PACKED: "packed",
    PALLETIZED: "palletized",
    DEPARTED: "departed",
    CANCELLED: "cancelled",
    HOLD: "hold",
  },
  STATUS_LABEL: (langCode: string) => {
    return [
      {
        value: "pending",
        label: lang("outbound.status.pending", langCode),
        className: "bg-gray-400",
        // icon: IconAlertCircle,
      },

      {
        value: "allocated",
        label: lang("outbound.status.allocated", langCode),
        className: "bg-gray-400",
        // icon: IconAlertCircle,
      },

      {
        value: "picking",
        label: lang("outbound.status.picking", langCode),
        className: "bg-gray-400",
        // icon: IconAlertCircle,
      },

      {
        value: "picked",
        label: lang("outbound.status.picked", langCode),
        className: "bg-gray-400",
        // icon: IconAlertCircle,
      },

      {
        value: "palletized",
        label: lang("outbound.status.palletized", langCode),
        className: "bg-green-400",
      },
      {
        value: "departed",
        label: lang("outbound.status.departed", langCode),
        className: "bg-green-600",
      },
      {
        value: "hold",
        label: lang("outbound.status.hold", langCode),
        className: "bg-green-600",
      },
      {
        value: "cancelled",
        label: lang("outbound.status.cancelled"),
        className: "bg-red-400",
      },
    ];
  },
};

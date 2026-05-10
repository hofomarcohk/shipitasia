import { lang } from "@/lang/base";

export const OUTBOUND = {
  STATUS: {
    PENDING: "pending",
    PROCESSING: "processing",
    DEPARTED: "departed",
    CANCEL: "cancelled",
  },

  STATUS_LABEL: (langCode: string) => {
    return [
      {
        value: "pending",
        label: lang("inbound.status.pending", langCode),
        className: "bg-gray-400",
        // icon: "IconAlertCircle",
      },
      {
        value: "outbounding",
        label: lang("inbound.status.outbounding", langCode),
        className: "bg-orange-400",
      },
      {
        value: "outbounded",
        label: lang("inbound.status.outbounded", langCode),
        className: "bg-green-600",
      },
      {
        value: "cancelled",
        label: lang("inbound.status.cancelled", langCode),
        className: "bg-red-400",
      },
    ];
  },
};

export const OUTBOUND_WORKFLOW: {
  [key: string]: any;
} = {
  [OUTBOUND.STATUS.PROCESSING]: [OUTBOUND.STATUS.PENDING],
  [OUTBOUND.STATUS.DEPARTED]: [OUTBOUND.STATUS.PROCESSING],
  [OUTBOUND.STATUS.CANCEL]: [OUTBOUND.STATUS.PENDING],
};

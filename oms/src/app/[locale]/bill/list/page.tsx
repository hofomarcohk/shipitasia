"use client";

import {
  m_br,
  m_date,
  m_int,
  m_number,
  m_select,
  m_table,
  m_text,
  m_textarea,
  m_title,
} from "@/components/modal/custom-modal-item";
import PageLayout from "@/components/page-layout";
import { getCurrentLangCode, lang } from "@/lang/base";
import { IconEdit } from "@tabler/icons-react";
import { useState } from "react";

export default function Page(param: any) {
  const [langCode, setLangCode] = useState(getCurrentLangCode());

  const billStatus = [
    {
      value: "pending",
      label: lang("outbound.status.pending"),
      className: "bg-gray-400",
      // icon: IconAlertCircle,
    },

    {
      value: "cancelled",
      label: lang("outbound.status.cancelled"),
      className: "bg-red-400",
    },
  ];

  const modalView = {
    id: "modal_view",
    title: lang("bill.modal.view.title", langCode),
    description: lang("bill.modal.view.description", langCode),
    fields: [
      m_title(lang("utils.basic", langCode)),
      m_text(lang("bill.fields.orderId", langCode), "orderId"),
      m_select(lang("utils.status"), "status", billStatus),
      m_text(lang("utils.title"), "title", {
        className: "col-span-2 mb-3",
      }),

      m_table(lang("bill.fields.billItems", langCode), "billItems", {
        className: "col-span-2 mb-3",
        columns: [
          m_text(lang("bill.fields.itemName", langCode), "name"),
          m_int(lang("bill.fields.qty", langCode), "qty", {
            className: "w-[100px]",
          }),
          m_number(lang("bill.fields.unitPrice", langCode), "unitPrice", {
            className: "w-[100px]",
          }),
        ],
      }),

      m_textarea(lang("utils.remarks"), "remarks", {
        className: "col-span-2",
      }),

      m_text(lang("bill.fields.currency", langCode), "currency"),
      m_text(lang("bill.fields.billAmount", langCode), "billAmount"),
      m_text(lang("bill.fields.discount", langCode), "discount"),
      m_text(lang("bill.fields.totalAmount", langCode), "totalAmount"),

      m_text(lang("bill.fields.paymentMethod", langCode), "paymentMethod"),

      m_title(lang("utils.timestamp", langCode)),
      m_date(lang("bill.fields.paidAt", langCode), "paidAt", {
        show: [["status", "paid"]],
      }),
      m_date(lang("utils.cancelledAt", langCode), "cancelledAt", {
        show: [["status", "cancelled"]],
      }),
      m_date(lang("bill.fields.voidedAt", langCode), "voidedAt", {
        show: [["status", "void"]],
      }),
      m_date(lang("bill.fields.refundedAt", langCode), "refundedAt", {
        show: [["status", "refunded"]],
      }),
      m_br(),
      m_date(lang("utils.createdAt", langCode), "createdAt"),
      m_date(lang("utils.updatedAt", langCode), "updatedAt"),
    ],
    buttons: [
      {
        text: lang("button.pay", langCode),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["PUT:appContent/popUp/scheduledPopUp", "refresh_table"],
        options: {
          show: [["status", "pending"]],
        },
      },
    ],
    default: {
      status: "pending",
      billItems: [
        {
          name: "test",
          qty: 1,
          unitPrice: 100,
        },
      ],
    },
    options: {
      //  is_readonly: true,
    },
  };

  const table = {
    api: "GET:/api/cms/bill",
    params: {},
    columns: [
      {
        id: "select",
        type: "select",
        title: "",
      },
      {
        id: "orderId",
        type: "text",
        title: lang("outbound.fields.orderId", langCode),
        className: "max-w-[300px] line-clamp-1",
        sort: true,
      },
      {
        id: "title",
        type: "text",
        title: lang("utils.title", langCode),
      },
      {
        id: "status",
        type: "status",
        title: lang("utils.status", langCode),
        filter: true,
        data: billStatus,
      },
      {
        id: "totalAmount",
        type: "text",
        title: lang("bill.fields.totalAmount", langCode),
      },
      {
        id: "createdAt",
        type: "date",
        title: lang("utils.createdAt", langCode),
        filter: true,
        data: [],
      },
      {
        id: "actions",
        type: "actions",
        title: "",
        actions: [
          {
            icon: IconEdit,
            text: "Edit",
            modal: "modal_view",
          },
        ],
      },
    ],
  };

  const props = {
    title: "bill.page_list.title",
    description: "bill.page_list.description",
    path: [
      { name: "menu.account", href: "#" },
      { name: "menu.billing", href: "#" },
    ],
    toolbar: [
      {
        icon: IconEdit,
        type: "button",
        text: lang("button.create"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        modal: "modal_view",
      },
    ],
    modals: [modalView],
    table: table,
  };
  return <PageLayout {...props}></PageLayout>;
}

"use client";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import { Breadcrumbs } from "@/components/breadcrumbs";
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
import { lang } from "@/lang/base";
import { IconEdit } from "@tabler/icons-react";
import { useEffect, useState } from "react";

export default function Page(param: any) {
  const [langCode, setLangCode] = useState("en");

  const init = async () => {
    const response = await param.params;
    setLangCode(response.locale);
  };
  useEffect(() => {
    init();
  }, []);

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
      m_select(lang("utils.status", langCode), "status", billStatus),
      m_text(lang("utils.title", langCode), "title", {
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

      m_textarea(lang("utils.remarks", langCode), "remarks", {
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
    options: {
      is_readonly: true,
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
        title: "outbound.fields.orderId",
        className: "max-w-[300px] line-clamp-1",
        sort: true,
      },
      {
        id: "title",
        type: "text",
        title: "utils.title",
      },
      {
        id: "status",
        type: "status",
        title: "utils.status",
        filter: true,
        data: billStatus,
      },
      {
        id: "totalAmount",
        type: "text",
        title: "bill.fields.totalAmount",
      },
      {
        id: "createdAt",
        type: "date",
        title: "utils.createdAt",
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
      { name: "menu.home", href: "#" },
      { name: "menu.dashboard", href: "#" },
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
    init,
  };
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumbs path={props.path} />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="grid auto-rows-min gap-4 md:grid-cols-3">
            <div className="aspect-video rounded-xl bg-muted/50" />
            <div className="aspect-video rounded-xl bg-muted/50" />
            <div className="aspect-video rounded-xl bg-muted/50" />
          </div>
          <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min" />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

"use client";

import { setOptions } from "@/components/helpers/utils";
import {
  m_address,
  m_br,
  m_date,
  m_number,
  m_select,
  m_text,
  m_textarea,
  m_title,
} from "@/components/modal/custom-modal-item";
import PageLayout from "@/components/page-layout";
import { http_request } from "@/lib/httpRequest";
import { OptionItem } from "@/types/Utils";
import { IconEdit } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function Page(param: any) {
  const t = useTranslations();
  const [warehouseList, setWarehouseList] = useState<OptionItem[]>([]);
  const [countryList, setCountryList] = useState<OptionItem[]>([]);
  const [logisticPartyList, setLogisticPartyList] = useState<OptionItem[]>([]);

  const outboundOrderStatus = [
    {
      value: "pending",
      label: t("outbound.status.pending"),
      className: "bg-gray-400",
    },
    {
      value: "processing",
      label: t("outbound.status.processing"),
      className: "bg-blue-400",
    },
    {
      value: "departed",
      label: t("outbound.status.departed"),
      className: "bg-green-400",
    },
    {
      value: "hold",
      label: t("outbound.status.hold"),
      className: "bg-yellow-400",
    },
    {
      value: "cancelled",
      label: t("outbound.status.cancelled"),
      className: "bg-red-400",
    },
  ];

  const init = async () => {
    const response = await param.params;
    http_request("GET", "/api/cms/list/warehouse").then(async (data) => {
      const json = await data.json();
      setOptions(setWarehouseList, json);
    });
    http_request("GET", "/api/cms/list/country", {
      lang: response.locale,
    }).then(async (data) => {
      const json = await data.json();
      setOptions(setCountryList, json);
    });
    http_request("GET", "/api/cms/list/logistic-party", {
      lang: response.locale,
    }).then(async (data) => {
      const json = await data.json();
      setOptions(setLogisticPartyList, json);
    });
  };

  const modalEdit = {
    id: "modal_edit",
    title: "outbound.modal.edit.title",
    description: "outbound.modal.edit.description",
    fields: [
      m_title(t("utils.basic")),
      m_text(t("outbound.fields.orderId"), "orderId", {
        is_readonly: true,
        is_required: true,
      }),
      m_select(t("utils.status"), "status", outboundOrderStatus, {
        is_required: true,
        is_readonly: true,
      }),
      m_select(t("outbound.fields.warehouse"), "warehouseCode", warehouseList, {
        is_required: true,
        is_readonly: true,
      }),
      m_br(),
      m_select(
        t("outbound.fields.logisticParty"),
        "logisticParty",
        logisticPartyList
      ),
      m_text(t("outbound.fields.logisticService"), "logisticService"),
      m_text(t("outbound.fields.trackingNo"), "trackingNo", {
        is_readonly: true,
      }),
      m_text(t("outbound.fields.referenceNo"), "referenceNo", {
        is_readonly: true,
      }),

      m_textarea(t("utils.remarks"), "remarks", {
        className: "col-span-2",
      }),

      m_address(t("outbound.fields.to_address"), "to", {
        is_required: true,
        className: "col-span-2",
      }),

      m_title(t("outbound.fields.dimension")),
      m_number(t("outbound.fields.width"), "width", {
        is_readonly: true,
      }),
      m_number(t("outbound.fields.height"), "height", {
        is_readonly: true,
      }),
      m_number(t("outbound.fields.length"), "length", {
        is_readonly: true,
      }),
      m_number(t("outbound.fields.weight"), "weight", {
        is_readonly: true,
      }),
      m_br(),

      m_title(t("utils.timestamp")),
      m_date(t("utils.cancelledAt"), "cancelledAt", {
        is_readonly: true,
        show: [["status", "cancelled"]],
      }),
      m_date(t("outbound.fields.outboundingAt"), "outboundingAt", {
        is_readonly: true,
        show: [["status", "outbounding"]],
      }),
      m_date(t("outbound.fields.outboundedAt"), "outboundedAt", {
        is_readonly: true,
        show: [["status", "outbounded"]],
      }),
      m_br(),
      m_date(t("utils.createdAt"), "createdAt", {
        is_readonly: true,
      }),
      m_date(t("utils.updatedAt"), "updatedAt", {
        is_readonly: true,
      }),
    ],
    buttons: [
      {
        text: t("button.update"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["PUT:/api/cms/outbound", "refresh_table"],
      },
    ],
    options: {
      readonly: [["status", "nin", ["pending"]]],
    },
  };
  const table = {
    api: "GET:/api/cms/outbound",
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
        title: t("outbound.fields.orderId"),
        className: "max-w-[300px] line-clamp-1",
        sort: true,
      },
      {
        id: "trackingNo",
        type: "text",
        title: t("outbound.fields.trackingNo"),
      },
      {
        id: "status",
        type: "status",
        title: t("utils.status"),
        filter: true,
        data: outboundOrderStatus,
      },
      {
        id: "warehouseCode",
        type: "status",
        title: t("outbound.fields.warehouse"),
        filter: true,
        data: warehouseList,
      },
      {
        id: "actions",
        type: "actions",
        title: "",
        actions: [
          {
            icon: IconEdit,
            text: t("button.edit"),
            modal: "modal_edit",
          },
        ],
      },
    ],
  };
  const props = {
    title: "outbound.page.title",
    description: "outbound.page.description",
    path: [
      { name: "menu.outbound", href: "#" },
      { name: "menu.outbound_request", href: "#" },
    ],
    toolbar: [],
    modals: [modalEdit],
    table: table,
    init,
  };

  useEffect(() => {
    init();
  }, []);
  return <PageLayout {...props}></PageLayout>;
}

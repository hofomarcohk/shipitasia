"use client";

import { setOptions } from "@/components/helpers/utils";
import PageLayout from "@/components/layout/page-layout";
import {
  m_address,
  m_br,
  m_date,
  m_multiselect,
  m_number,
  m_select,
  m_text,
  m_textarea,
  m_title,
} from "@/components/modal/custom-modal-item";
import {
  c_actions,
  c_select,
  c_status,
  c_text,
} from "@/components/table/custom-column-item";
import { get_request } from "@/lib/httpRequest";
import { OptionItem } from "@/types/Utils";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

export default function Page() {
  const [warehouseList, setWarehouseList] = useState<OptionItem[]>([]);
  const [countryList, setCountryList] = useState<OptionItem[]>([]);
  const [categoryList, setCategoryList] = useState<OptionItem[]>([]);
  const [restrictionList, setRestrictionList] = useState<OptionItem[]>([]);
  const t = useTranslations();
  const lang = useLocale();

  const init = async () => {
    await Promise.all([
      get_request("/api/wms/list/warehouse").then(async (data) => {
        const json = await data.json();
        setOptions(setWarehouseList, json);
      }),
      get_request("/api/wms/list/country", { lang }).then(async (data) => {
        const json = await data.json();
        setOptions(setCountryList, json.data);
      }),
      get_request("/api/wms/list/category", { lang }).then(async (data) => {
        const json = await data.json();
        setOptions(setCategoryList, json);
      }),
      get_request("/api/wms/list/restriction", { lang }).then(async (data) => {
        const json = await data.json();
        setOptions(setRestrictionList, json);
      }),
    ]);
  };

  const inboundOrderStatus = [
    {
      value: "pending",
      label: t("inbound.status.pending"),
      className: "bg-gray-400",
      // icon: "IconAlertCircle",
    },
    {
      value: "arrived",
      label: t("inbound.status.arrived"),
      className: "bg-blue-400",
    },
    {
      value: "received",
      label: t("inbound.status.received"),
      className: "bg-blue-600",
    },
    {
      value: "scheduled",
      label: t("inbound.status.scheduled"),
      className: "bg-blue-800",
    },
    {
      value: "picking",
      label: t("inbound.status.picking"),
      className: "bg-orange-400",
    },
    {
      value: "picked",
      label: t("inbound.status.picked"),
      className: "bg-orange-600",
    },
    {
      value: "packed",
      label: t("inbound.status.packed"),
      className: "bg-cyan-600",
    },
    {
      value: "palletized",
      label: t("inbound.status.palletized"),
      className: "bg-green-400",
    },
    {
      value: "departed",
      label: t("inbound.status.departed"),
      className: "bg-green-600",
    },
    {
      value: "cancelled",
      label: t("inbound.status.cancelled"),
      className: "bg-red-400",
    },
  ];

  const modalCreate = {
    id: "modal_create",
    title: t("inbound.modal.create.title"),
    description: t("inbound.modal.create.description"),
    //className: "w-3/12",
    fields: [
      m_title(t("utils.basic")),
      m_text(t("inbound.fields.orderId"), "orderId", {
        is_readonly: true,
      }),
      m_select(t("utils.status"), "status", inboundOrderStatus, {
        is_required: true,
        is_readonly: true,
      }),
      m_select(t("utils.warehouseCode"), "warehouseCode", warehouseList, {
        is_required: true,
      }),
      m_br(),
      m_multiselect(t("inbound.fields.category"), "category", categoryList, {
        is_required: true,
      }),
      m_multiselect(
        t("inbound.fields.restrictionTags"),
        "restrictionTags",
        restrictionList,
        { is_required: true }
      ),
      m_text(t("inbound.fields.trackingNo"), "trackingNo"),
      m_text(t("inbound.fields.referenceNo"), "referenceNo", {
        is_readonly: true,
        show: [["referenceNo", "x", true]],
      }),
      m_number(t("inbound.fields.declaredValue"), "declaredValue"),
      m_textarea(t("inbound.fields.remarks"), "remarks", {
        className: "col-span-2",
      }),

      // to address
      m_address(t("inbound.fields.to_address"), "to", {
        is_required: true,
        className: "col-span-2",
      }),

      m_title(t("inbound.fields.dimension")),
      m_number(t("inbound.fields.width"), "width"),
      m_number(t("inbound.fields.height"), "height"),
      m_number(t("inbound.fields.length"), "length"),
      m_number(t("inbound.fields.weight"), "weight"),
      m_br(),

      m_title(t("utils.timestamp")),
      m_date(t("inbound.fields.willArrivedAt"), "willArrivedAt"),
      m_date(t("utils.cancelledAt"), "cancelledAt", {
        is_readonly: true,
        show: [["status", "cancelled"]],
      }),
      m_date(t("inbound.fields.inboundingAt"), "inboundingAt", {
        is_readonly: true,
        show: [["status", "inbounding"]],
      }),
      m_date(t("inbound.fields.inboundedAt"), "inboundedAt", {
        is_readonly: true,
        show: [["status", "inbounded"]],
      }),
      m_date(t("inbound.fields.outboundingAt"), "outboundingAt", {
        is_readonly: true,
        show: [["status", "outbounding"]],
      }),
      m_date(t("inbound.fields.outboundedAt"), "outboundedAt", {
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
        text: t("button.create"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["POST:/api/wms/inbound", "refresh_table"],
      },
    ],
    default: {
      clientId: "admin",
      status: "pending",
    },
  };
  const modalEdit = {
    id: "modal_edit",
    title: t("inbound.modal.edit.title"),
    description: t("inbound.modal.edit.description"),
    fields: [
      ...modalCreate.fields.filter(
        (field) =>
          ![
            "addresses",
            "isCustomToAddress",
            "isAddAddressList",
            "isAddFromAddress",
          ].includes(field.key)
      ),
    ],
    buttons: [
      {
        text: t("button.update"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["PUT:/api/wms/inbound", "refresh_table"],
      },
    ],
    default: {
      isCustomToAddress: true,
      isAddFromAddress: true,
    },
    options: {},
  };
  const table = {
    api: "GET:/api/wms/inbound",
    params: {},
    columns: [
      c_select(),
      c_text(t("inbound.fields.orderId"), "orderId"),
      c_text(t("inbound.fields.trackingNo"), "trackingNo"),
      c_status(t("utils.status"), "status", inboundOrderStatus, {
        filter: true,
      }),
      c_status(t("utils.warehouseCode"), "warehouseCode", warehouseList, {
        filter: true,
      }),
      c_actions([
        {
          icon: IconEdit,
          text: t("button.edit"),
          modal: "modal_edit",
        },
      ]),
    ],
  };
  const props = {
    title: "inbound.page.title",
    description: "inbound.page.description",
    path: [
      { name: "menu.inbound", href: "#" },
      { name: "menu.inbound_request", href: "#" },
    ],
    toolbar: [
      {
        icon: IconPlus,
        type: "button",
        text: t("button.create"),
        modal: "modal_create",
      },
    ],
    modals: [modalCreate, modalEdit],
    table,
    init,
  };
  return <PageLayout {...props}></PageLayout>;
}

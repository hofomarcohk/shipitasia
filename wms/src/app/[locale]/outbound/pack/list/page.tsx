"use client";

import PageLayout from "@/components/layout/page-layout";
import {
  m_br,
  m_date,
  m_multiselect,
  m_number,
  m_select,
  m_text,
  m_textarea,
  m_title,
} from "@/components/modal/custom-modal-item";
import { lang } from "@/lang/base";
import { IconEdit, IconPlus } from "@tabler/icons-react";

export default function Page() {
  const init = async () => {};
  const modalCreate = {
    id: "modal_create",
    title: lang("outbound.modal.create.title"),
    description: lang("outbound.modal.create.description"),
    //className: "w-3/12",
    fields: [
      m_title(lang("utils.basic")),
      m_text(lang("outbound.fields.orderId"), "orderId", { is_required: true }),
      m_text(lang("utils.id"), "_id", { is_readonly: true }),
      m_select(
        lang("outbound.fields.status"),
        "status",
        [
          { value: "pending", label: lang("outbound.status.pending") },
          { value: "inbounding", label: lang("outbound.status.inbounding") },
          { value: "inbounded", label: lang("outbound.status.inbounded") },
          { value: "outbounding", label: lang("outbound.status.outbounding") },
          { value: "outbounded", label: lang("outbound.status.outbounded") },
          { value: "cancelled", label: lang("outbound.status.cancelled") },
        ],
        { is_required: true, is_readonly: true }
      ),
      m_select(
        lang("outbound.fields.warehouse"),
        "warehouse",
        [{ value: "hk01", label: "HK01" }],
        { is_required: true, is_readonly: true }
      ),
      m_multiselect(lang("outbound.fields.category"), "category", [], {
        is_required: true,
      }),
      m_multiselect(
        lang("outbound.fields.restrictionTags"),
        "restrictionTags",
        [],
        { is_required: true }
      ),
      m_text(lang("outbound.fields.trackingNo"), "trackingNo"),
      m_text(lang("outbound.fields.referenceNo"), "referenceNo", {
        is_readonly: true,
      }),

      m_title(lang("outbound.fields.dimension")),
      m_number(lang("outbound.fields.width"), "width"),
      m_number(lang("outbound.fields.height"), "height"),
      m_number(lang("outbound.fields.length"), "length"),
      m_number(lang("outbound.fields.weight"), "weight"),
      m_number(lang("outbound.fields.declaredValue"), "declaredValue"),
      m_br(),

      m_title(lang("outbound.fields.source_address")),
      m_select(lang("utils.country"), "source.country", [], {
        is_required: true,
      }),
      m_text(lang("utils.region"), "source.region", { is_required: true }),
      m_text(lang("utils.state"), "source.state", { is_required: true }),
      m_text(lang("utils.city"), "source.city", { is_required: true }),
      m_text(lang("utils.district"), "source.district", { is_required: true }),
      m_text(lang("utils.zip"), "source.zip", { is_required: true }),
      m_text(lang("utils.address"), "source.address", {
        is_required: true,
        className: "col-span-2 mb-3",
      }),

      m_title(lang("outbound.fields.destination_address")),
      m_select(lang("utils.country"), "destination.country", [], {
        is_required: true,
      }),
      m_text(lang("utils.city"), "destination.city", { is_required: true }),
      m_text(lang("utils.region"), "destination.region", { is_required: true }),
      m_text(lang("utils.district"), "destination.district", {
        is_required: true,
      }),
      m_text(lang("utils.state"), "destination.state", { is_required: true }),
      m_text(lang("utils.zip"), "destination.zip", { is_required: true }),
      m_text(lang("utils.address"), "destination.address", {
        is_required: true,
        className: "col-span-2 mb-3",
      }),

      m_title(lang("outbound.fields.timestamp")),
      m_date(lang("outbound.fields.willArrivedAt"), "willArrivedAt"),
      m_date(lang("outbound.fields.cancelledAt"), "cancelledAt", {
        is_readonly: true,
      }),
      m_date(lang("outbound.fields.inboundingAt"), "inboundingAt", {
        is_readonly: true,
      }),
      m_date(lang("outbound.fields.inboundedAt"), "inboundedAt", {
        is_readonly: true,
      }),
      m_date(lang("outbound.fields.outboundingAt"), "outboundingAt", {
        is_readonly: true,
      }),
      m_date(lang("outbound.fields.outboundedAt"), "outboundedAt", {
        is_readonly: true,
      }),

      m_textarea(lang("outbound.fields.remarks"), "remarks", {
        className: "col-span-2",
      }),
    ],
    buttons: [
      {
        text: lang("button.create"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["PUT:appContent/popUp/scheduledPopUp", "refresh_table"],
      },
    ],
  };
  const modalEdit = {
    id: "modal_edit",
    title: lang("outbound.modal.edit.title"),
    description: lang("outbound.modal.edit.description"),
    fields: [...modalCreate.fields],
    buttons: [
      {
        text: lang("button.update"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["PUT:appContent/popUp/scheduledPopUp", "refresh_table"],
      },
    ],
  };
  const table = {
    api: "GET:/api/wms/inbound",
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
        className: "w-[300px] line-clamp-1",
        sort: true,
      },
      {
        id: "trackingNo",
        type: "text",
        title: "outbound.fields.trackingNo",
      },
      {
        id: "status",
        type: "status",
        title: "outbound.fields.status",
        filter: true,
        data: [
          {
            value: "pending",
            label: lang("outbound.status.pending"),
            className: "bg-gray-400",
            // icon: IconAlertCircle,
          },
          {
            value: "inbounding",
            label: lang("outbound.status.inbounding"),
            className: "bg-blue-400",
          },
          {
            value: "inbounded",
            label: lang("outbound.status.inbounded"),
            className: "bg-blue-600",
          },
          {
            value: "outbounding",
            label: lang("outbound.status.outbounding"),
            className: "bg-green-400",
          },
          {
            value: "outbounded",
            label: lang("outbound.status.outbounded"),
            className: "bg-green-600",
          },
          {
            value: "cancelled",
            label: lang("outbound.status.cancelled"),
            className: "bg-red-400",
          },
        ],
      },
      {
        id: "warehouse",
        type: "status",
        title: "outbound.fields.warehouse",
        filter: true,
        data: [
          {
            value: "hk01",
            label: "HK01",
          },
        ],
      },
      {
        id: "category",
        type: "status",
        title: "outbound.fields.category",
        filter: true,
        data: [],
      },
      {
        id: "restrictionTags",
        type: "status",
        title: "outbound.fields.restrictionTags",
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
            modal: "modal_edit",
          },
        ],
      },
    ],
  };
  const props = {
    title: "outbound.page_list.title",
    description: "outbound.page_list.description",
    path: [
      { name: "menu.outbound", href: "#" },
      { name: "menu.outbound_request", href: "#" },
    ],
    toolbar: [
      {
        icon: IconPlus,
        type: "button",
        text: lang("button.create"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        modal: "modal_create",
      },
    ],
    modals: [modalCreate, modalEdit],
    table: table,
    init,
  };
  return <PageLayout {...props}></PageLayout>;
}

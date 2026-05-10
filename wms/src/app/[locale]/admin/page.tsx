"use client";

import PageLayout from "@/components/layout/page-layout";
import {
  m_br,
  m_date,
  m_email,
  m_hr,
  m_multiselect,
  m_select,
  m_text,
  m_title,
} from "@/components/modal/custom-modal-item";
import { lang } from "@/lang/base";
import { IconEdit, IconPlus } from "@tabler/icons-react";

export default function Page() {
  const init = () => {};
  const modalCreate = {
    id: "modal_create",
    title: "Create Inbound Request",
    description: "Create a new inbound request",
    //className: "w-3/12",
    fields: [
      m_title("Basic"),
      m_text("Name", "title", { is_required: true }),
      m_text("ID", "id", { is_readonly: true }),
      m_br(),
      m_email("Name", "name1", { is_required: true }),
      m_email("Email", "email", { is_required: true, is_readonly: true }),
      m_title("Details"),
      m_select(
        "Status",
        "status",
        [
          { value: "pending", label: lang("inbound.status.pending") },
          { value: "inbounding", label: lang("inbound.status.inbounding") },
          { value: "inbounded", label: lang("inbound.status.inbounded") },
          { value: "outbounding", label: lang("inbound.status.outbounding") },
          { value: "departed", label: lang("inbound.status.departed") },
          { value: "cancelled", label: lang("inbound.status.cancelled") },
        ],
        { is_required: true, is_readonly: true }
      ),
      m_select(
        "Status",
        "status1",
        [
          { value: "pending", label: "Pending" },
          { value: "inbounding", label: "Inbounding" },
          { value: "inbounded", label: "Inbounded" },
          { value: "outbounding", label: "Outbounding" },
          { value: "outbounded", label: "Outbounded" },
          { value: "cancelled", label: "Cancelled" },
        ],
        { is_required: true, is_readonly: true }
      ),
      m_multiselect(
        "Warehouse",
        "warehouse1",
        [
          { value: "hk01", label: "HK01" },
          { value: "hk02", label: "HK02" },
          { value: "hk03", label: "HK03" },
          { value: "hk04", label: "HK04" },
        ],
        { is_required: true }
      ),
      m_multiselect(
        "Warehouse",
        "warehouse",
        [
          { value: "hk01", label: "HK01" },
          { value: "hk02", label: "HK02" },
          { value: "hk03", label: "HK03" },
          { value: "hk04", label: "HK04" },
        ],
        { is_required: true, is_readonly: true }
      ),
      m_hr(),
      m_text("Created by", "created_by", { is_readonly: true }),
      m_text("Updated by", "updated_by", { is_readonly: true }),
      m_date("Created at", "created_at"),
      m_date("Updated at", "updated_at", { is_readonly: true }),
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
    title: "Edit Inbound Request",
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
        id: "_id",
        type: "text",
        title: "inbound.page_list.columns.id",
        className: "w-[80px]",
        sort: true,
      },
      {
        id: "trackingNo",
        type: "text",
        title: "inbound.page_list.columns.trackingNo",
      },
      {
        id: "status",
        type: "status",
        title: "inbound.page_list.columns.status",
        filter: true,
        data: [
          {
            value: "pending",
            label: lang("inbound.status.pending"),
            className: "bg-gray-400",
            // icon: IconAlertCircle,
          },
          {
            value: "inbounding",
            label: lang("inbound.status.inbounding"),
            className: "bg-blue-400",
          },
          {
            value: "inbounded",
            label: lang("inbound.status.inbounded"),
            className: "bg-blue-600",
          },
          {
            value: "outbounding",
            label: lang("inbound.status.outbounding"),
            className: "bg-green-400",
          },
          {
            value: "departed",
            label: lang("inbound.status.departed"),
            className: "bg-green-600",
          },
          {
            value: "cancelled",
            label: lang("inbound.status.cancelled"),
            className: "bg-red-400",
          },
        ],
      },
      {
        id: "warehouse",
        type: "status",
        title: "inbound.page_list.columns.warehouse",
        filter: true,
        data: [
          {
            value: "hk01",
            label: "HK01",
          },
        ],
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
    title: "inbound.page_list.title",
    description: "inbound.page_list.description",
    path: [
      { name: "menu.inbound", href: "#" },
      { name: "menu.inbound_request", href: "#" },
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

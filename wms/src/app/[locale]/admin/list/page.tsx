"use client";

import PageLayout from "@/components/layout/page-layout";
import {
  m_date,
  m_hr,
  m_password,
  m_select,
  m_switch,
  m_text,
  m_title,
} from "@/components/modal/custom-modal-item";
import { is_readonly, is_required } from "@/components/modal/modal-attrs";
import {
  c_actions,
  c_date,
  c_select,
  c_status,
  c_text,
} from "@/components/table/custom-column-item";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

export default function Page(param: any) {
  const t = useTranslations();
  const init = async () => {};

  const statusList = [
    { label: t("admin.status.active"), value: "active" },
    {
      label: t("admin.status.inactive"),
      value: "inactive",
      className: "bg-red-500",
    },
  ];
  const roleList = [{ label: t("admin.role.admin"), value: "admin" }];

  const modalCreate = {
    id: "modal_create",
    title: t("admin.modal.create.title"),
    description: t("admin.modal.create.description"),
    //className: "w-3/12",
    fields: [
      m_title(t("utils.basic")),
      m_select(t("admin.fields.role"), "role", roleList, { is_required }),
      m_text(t("utils.id"), "_id", { is_readonly }),
      m_text(t("admin.fields.username"), "username", { is_required }),
      m_password(t("admin.fields.password"), "password", { is_required }),
      m_text(t("admin.fields.firstName"), "firstName", { is_required }),
      m_text(t("admin.fields.lastName"), "lastName", { is_required }),
      m_switch(t("utils.isActive"), "isActive"),
    ],
    buttons: [
      {
        text: t("button.create"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["POST:/api/wms/admin", "refresh_table"],
      },
    ],
    default: {
      role: "admin",
      isActive: true,
    },
  };
  const modalEdit = {
    id: "modal_edit",
    title: t("admin.modal.edit.title"),
    description: t("admin.modal.edit.description"),
    fields: [
      ...modalCreate.fields,
      m_hr(),
      m_text(t("utils.createdBy"), "createdBy", { is_readonly }),
      m_text(t("utils.updatedBy"), "updatedBy", { is_readonly }),
      m_date(t("utils.createdAt"), "createdAt", { is_readonly }),
      m_date(t("utils.updatedAt"), "updatedAt", { is_readonly }),
    ],
    buttons: [
      {
        text: t("button.update"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["PUT:/api/wms/admin", "refresh_table"],
      },
    ],
  };

  const table = {
    api: "GET:/api/wms/admin",
    params: {},
    columns: [
      c_select(),
      c_text(t("admin.fields.username"), "username"),
      c_status(t("admin.fields.role"), "role", roleList),
      c_status(t("utils.status"), "status", statusList, { filter: true }),
      c_date(t("utils.updatedAt"), "updatedAt", { sort: true }),
      c_actions([
        {
          icon: IconEdit,
          text: "Edit",
          modal: "modal_edit",
        },
      ]),
    ],
  };
  const props = {
    title: "admin.page.title",
    description: "admin.page.description",
    path: [
      { name: "menu.system", href: "#" },
      { name: "admin.page.title", href: "#" },
    ],
    toolbar: [
      {
        icon: IconPlus,
        type: "button",
        text: t("button.create"),
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

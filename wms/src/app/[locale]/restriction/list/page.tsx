"use client";

import PageLayout from "@/components/layout/page-layout";
import {
  m_date,
  m_hr,
  m_text,
  m_title,
} from "@/components/modal/custom-modal-item";
import {
  c_actions,
  c_date,
  c_select,
  c_text,
} from "@/components/table/custom-column-item";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

export default function Page() {
  const t = useTranslations();
  const init = async () => {};

  const modalCreate = {
    id: "modal_create",
    title: t("restriction.modal.create.title"),
    description: t("restriction.modal.create.description"),
    fields: [
      m_title(t("utils.basic")),
      m_text(t("utils.systemKey"), "restrictionKey", {
        is_required: true,
      }),
      m_text(t("utils.id"), "_id", { is_readonly: true }),
      m_text(t("restriction.fields.restrictionNameEn"), "text.en", {
        is_required: true,
      }),
      m_text(t("restriction.fields.restrictionNameZhHk"), "text.zh_hk", {
        is_required: true,
      }),
      m_text(t("restriction.fields.restrictionNameZhCn"), "text.zh_cn", {
        is_required: true,
      }),
    ],
    buttons: [
      {
        text: t("button.create"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["POST:/api/wms/restriction", "refresh_table"],
      },
    ],
  };
  const modalEdit = {
    id: "modal_edit",
    title: t("restriction.modal.edit.title"),
    description: t("restriction.modal.edit.description"),
    fields: [
      ...modalCreate.fields,
      m_hr(),
      m_text(t("utils.createdBy"), "createdBy", {
        is_readonly: true,
      }),
      m_text(t("utils.updatedBy"), "updatedBy", {
        is_readonly: true,
      }),
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
        actions: ["PUT:/api/wms/restriction", "refresh_table"],
      },
    ],
  };

  const table = {
    api: "GET:/api/wms/restriction",
    params: {},
    columns: [
      c_select(),
      c_text(t("utils.systemKey"), "restrictionKey"),
      c_text(t("restriction.fields.restrictionNameEn"), "text.en"),
      c_text(t("restriction.fields.restrictionNameZhHk"), "text.zh_hk"),
      c_text(t("restriction.fields.restrictionNameZhCn"), "text.zh_cn"),
      c_date(t("utils.updatedAt"), "updatedAt", {
        sort: true,
      }),
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
    title: "restriction.page.title",
    description: "restriction.page.description",
    path: [
      { name: "menu.warehouse", href: "#" },
      { name: "restriction.page.title", href: "#" },
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

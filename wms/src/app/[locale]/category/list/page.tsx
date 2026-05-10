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
import { useState } from "react";

export default function Page(param: any) {
  const [langCode, setLangCode] = useState("en");
  const t = useTranslations();

  const init = async () => {
    const response = await param.params;
    setLangCode(response.locale);
  };

  const modalCreate = {
    id: "modal_create",
    title: t("category.modal.create.title"),
    description: t("category.modal.create.description"),
    //className: "w-3/12",
    fields: [
      m_title(t("utils.basic")),
      m_text(t("utils.systemKey"), "categoryKey", {
        is_required: true,
      }),
      m_text(t("utils.id"), "_id", { is_readonly: true }),
      m_text(t("category.fields.categoryNameEn"), "text.en", {
        is_required: true,
      }),
      m_text(t("category.fields.categoryNameZhHk"), "text.zh_hk", {
        is_required: true,
      }),
      m_text(t("category.fields.categoryNameZhCn"), "text.zh_cn", {
        is_required: true,
      }),
    ],
    buttons: [
      {
        text: t("button.create"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["POST:/api/wms/category", "refresh_table"],
      },
    ],
  };
  const modalEdit = {
    id: "modal_edit",
    title: t("category.modal.edit.title"),
    description: t("category.modal.edit.description"),
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
        actions: ["PUT:/api/wms/category", "refresh_table"],
      },
    ],
    options: {
      readonly_fields: ["categoryKey"],
    },
  };

  const table = {
    api: "GET:/api/wms/category",
    params: {},
    columns: [
      c_select(),
      c_text(t("utils.systemKey"), "categoryKey"),
      c_text(t("category.fields.categoryNameEn"), "text.en"),
      c_text(t("category.fields.categoryNameZhHk"), "text.zh_hk"),
      c_text(t("category.fields.categoryNameZhCn"), "text.zh_cn"),
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
    title: "category.page.title",
    description: "country.page.description",
    langCode,
    path: [
      { name: "menu.warehouse", href: "#" },
      { name: "category.page.title", href: "#" },
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

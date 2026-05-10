"use client";

import PageLayout from "@/components/layout/page-layout";
import {
  m_br,
  m_date,
  m_hr,
  m_select,
  m_text,
  m_title,
} from "@/components/modal/custom-modal-item";
import {
  c_actions,
  c_date,
  c_select,
  c_status,
  c_text,
} from "@/components/table/custom-column-item";
import { get_request } from "@/lib/httpRequest";
import { OptionItem } from "@/types/Utils";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

export default function Page(param: any) {
  const [countryList, setCountryList] = useState<OptionItem[]>([]);
  const t = useTranslations();
  const lang = useLocale();

  const init = async () => {
    get_request("/api/wms/list/country", { lang }).then(async (data) => {
      const json = await data.json();
      setCountryList(json.data.results);
    });
  };

  const modalCreate = {
    id: "modal_create",
    title: t("country.modal.create.title"),
    description: t("country.modal.create.description"),
    //className: "w-3/12",
    fields: [
      m_title(t("utils.basic")),
      m_text(t("warehouse.fields.warehouseCode"), "warehouseCode", {
        is_required: true,
      }),
      m_text(t("utils.id"), "_id", { is_readonly: true }),
      m_text(t("warehouse.fields.name"), "name", {
        is_required: true,
        className: "col-span-2 mb-3",
      }),
      m_br(),

      m_title(t("utils.address")),
      m_select(t("utils.country"), "address.country", countryList, {
        is_required: true,
      }),
      m_text(t("utils.city"), "address.city", {
        is_required: true,
      }),
      m_text(t("utils.region"), "address.region", {
        is_required: true,
      }),
      m_text(t("utils.district"), "address.district", {
        is_required: true,
      }),
      m_text(t("utils.state"), "address.state", {
        is_required: true,
      }),
      m_text(t("utils.zip"), "address.zip", { is_required: true }),
      m_text(t("utils.address"), "address.address", {
        is_required: true,
        className: "col-span-2 mb-3",
      }),

      m_title(t("utils.contacts")),

      m_text(t("utils.contactPerson"), "address.contactPerson"),
      m_text(t("utils.mobile"), "address.mobile", {
        placeholder: "+852-12345678",
      }),
    ],
    buttons: [
      {
        text: t("button.create"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["POST:/api/wms/warehouse", "refresh_table"],
      },
    ],
  };
  const modalEdit = {
    id: "modal_edit",
    title: t("warehouse.modal.edit.title"),
    description: t("warehouse.modal.edit.description"),
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
        actions: ["PUT:/api/wms/warehouse", "refresh_table"],
      },
    ],
  };

  const table = {
    api: "GET:/api/wms/warehouse",
    params: {},
    columns: [
      c_select(),
      c_text(t("warehouse.fields.warehouseCode"), "warehouseCode", {
        className: "w-[100px]",
      }),
      c_text(t("warehouse.fields.name"), "name", {
        className: "max-w-[150px]",
      }),
      c_status(t("utils.country"), "address.country", countryList, {
        filter: true,
        className: "max-w-[200px]",
      }),
      c_text(t("utils.address"), "address.address", {
        className: "max-w-[300px]",
      }),
      c_date(t("utils.updatedAt"), "updatedAt"),
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
    title: "warehouse.page.title",
    description: "warehouse.page.description",
    path: [
      { name: "menu.warehouse", href: "#" },
      { name: "menu.warehouse_management", href: "#" },
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
    table,
    init,
  };
  return <PageLayout {...props}></PageLayout>;
}

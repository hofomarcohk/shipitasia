"use client";

import PageLayout from "@/components/layout/page-layout";
import {
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
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function Page(param: any) {
  const t = useTranslations();
  const [warehouseList, setWarehouseList] = useState<OptionItem[]>([]);
  const init = async () => {
    get_request("/api/wms/list/warehouse").then(async (data) => {
      const json = await data.json();
      setWarehouseList(json.data.results);
    });
  };

  const modalCreate = {
    id: "modal_create",
    title: t("location.modal.create.title"),
    description: t("location.modal.create.description"),
    fields: [
      m_title(t("utils.basic")),
      m_text(t("location.fields.locationCode"), "locationCode", {
        is_required: true,
      }),
      m_select(
        t("location.fields.warehouseCode"),
        "warehouseCode",
        warehouseList,
        {
          is_required: true,
        }
      ),
    ],
    buttons: [
      {
        text: t("button.create"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["POST:/api/wms/warehouse/location", "refresh_table"],
      },
    ],
  };

  const modalEdit = {
    id: "modal_edit",
    title: t("location.modal.edit.title"),
    description: t("location.modal.edit.description"),
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
        actions: ["PUT:/api/wms/warehouse/location", "refresh_table"],
      },
    ],
  };

  const table = {
    api: "GET:/api/wms/warehouse/location",
    params: {},
    columns: [
      c_select(),
      c_text(t("location.fields.locationCode"), "locationCode", {
        sort: true,
      }),
      c_status(
        t("location.fields.warehouseCode"),
        "warehouseCode",
        warehouseList,
        { filter: true, sort: true }
      ),
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
    title: "location.page.title",
    description: "location.page.description",
    path: [
      { name: "menu.warehouse", href: "#" },
      { name: "menu.location_management", href: "#" },
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

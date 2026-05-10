"use client";

import { setOptions } from "@/components/helpers/utils";
import {
  m_addresses,
  m_checkbox,
  m_date,
  m_int,
  m_select,
  m_text,
  m_title,
} from "@/components/modal/custom-modal-item";
import PageLayout from "@/components/page-layout";
import {
  c_actions,
  c_boolean,
  c_select,
  c_status,
  c_text,
} from "@/components/table/custom-column-item";
import { getCurrentLangCode, lang } from "@/lang/base";
import { http_request } from "@/lib/httpRequest";
import { OptionItem } from "@/types/Utils";
import { IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

export default function Page(param: any) {
  const [langCode, setLangCode] = useState(getCurrentLangCode());
  const [warehouseList, setWarehouseList] = useState<OptionItem[]>([]);
  const [ruleList, setRuleList] = useState<OptionItem[]>([]);

  const init = async () => {
    const response = await param.params;
    setLangCode(response.locale);
    http_request("GET", "/api/cms/list/warehouse").then(async (data) => {
      const json = await data.json();
      setOptions(setWarehouseList, json);
    });
    setRuleList([
      {
        value: "basedOnQty",
        label: lang("autoOutbound.ruleType.basedOnQty", response.locale),
      },
    ]);
  };

  const modalCreate = {
    id: "modal_create",
    title: lang("autoOutbound.modal.create.title", langCode),
    description: lang("autoOutbound.modal.create.description", langCode),
    //className: "w-3/12",
    fields: [
      m_title(lang("utils.basic", langCode)),
      m_text(lang("utils.name", langCode), "name", {
        is_required: true,
      }),
      m_select(
        lang("utils.warehouseCode", langCode),
        "warehouseCode",
        warehouseList,
        {
          is_required: true,
        }
      ),
      m_checkbox(lang("autoOutbound.status.active", langCode), "isActive"),
      m_title(lang("autoOutbound.fields.rules", langCode)),
      m_select(
        lang("autoOutbound.fields.ruleType", langCode),
        "condition.type",
        ruleList,
        { is_required: true, is_readonly: true }
      ),
      m_int(
        lang("autoOutbound.ruleType.noOfPackages", langCode),
        "condition.value",
        { is_required: true, show: [["ruleType", "basedOnQty"]], min: 1 }
      ),

      m_addresses(lang("autoOutbound.fields.to_address", langCode), "to", {
        is_required: true,
      }),

      m_title(lang(langCode, langCode)),
      m_title(lang("utils.timestamp", langCode)),
      m_date(lang("utils.createdAt", langCode), "createdAt", {
        is_readonly: true,
      }),
      m_date(lang("utils.updatedAt", langCode), "updatedAt", {
        is_readonly: true,
      }),
    ],
    buttons: [
      {
        text: lang("button.create", langCode),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["POST:/api/cms/auto-outbound", "refresh_table"],
      },
    ],
    default: {
      status: true,
      ruleType: "basedOnQty",
      noOfPackages: 1,
      condition: {
        type: "basedOnQty",
        operator: "==",
        value: 1,
      },
    },
  };
  const modalEdit = {
    id: "modal_edit",
    title: lang("autoOutbound.modal.edit.title", langCode),
    description: lang("autoOutbound.modal.edit.description", langCode),
    fields: [...modalCreate.fields],
    buttons: [
      {
        text: lang("button.update", langCode),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["PUT:/api/cms/auto-outbound", "refresh_table"],
      },
    ],
  };
  const table = {
    api: "GET:/api/cms/auto-outbound",
    params: {},
    columns: [
      c_select(),
      c_text(lang("utils.name", langCode), "name"),
      c_status(
        lang("utils.warehouseCode", langCode),
        "warehouseCode",
        warehouseList,
        { filter: true }
      ),
      c_status(
        lang("autoOutbound.fields.ruleType", langCode),
        "condition.type",
        ruleList
      ),
      c_boolean(lang("utils.isActive", langCode), "isActive", {
        langCode,
        filter: true,
      }),
      c_text(lang("autoOutbound.fields.to_address", langCode), "to.address"),
      c_actions([
        {
          icon: IconEdit,
          text: lang("button.edit", langCode),
          modal: "modal_edit",
        },
        {
          icon: IconTrash,
          className: "text-red-400",
          text: lang("button.delete", langCode),
          modal: "modal_edit",
        },
      ]),
    ],
  };
  const props = {
    title: "autoOutbound.page_list.title",
    description: "autoOutbound.page_list.description",
    path: [
      { name: "menu.tools", href: "#" },
      { name: "menu.auto_outbound", href: "#" },
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

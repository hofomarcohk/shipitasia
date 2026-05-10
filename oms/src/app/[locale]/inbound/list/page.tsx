"use client";

import { ApiError } from "@/app/api/api-error";
import { useServerData } from "@/app/providers/ServerDataContext";
import { Fields } from "@/components/helpers/field-templates";
import { CountryOptions, setOptions } from "@/components/helpers/utils";
import {
  m_address,
  m_alert,
  m_br,
  m_date,
  m_multiselect,
  m_number,
  m_select,
  m_select_card,
  m_switch,
  m_text,
  m_textarea,
  m_title,
} from "@/components/modal/custom-modal-item";
import PageLayout from "@/components/page-layout";
import {
  c_actions,
  c_select,
  c_status,
  c_text,
} from "@/components/table/custom-column-item";
import { http_request } from "@/lib/httpRequest";
import { Address } from "@/types/Address";
import { OptionItem } from "@/types/Utils";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function Page(param: any) {
  const t = useTranslations();
  const [langCode, setLangCode] = useState("en");
  const [warehouseList, setWarehouseList] = useState<OptionItem[]>([]);
  const [categoryList, setCategoryList] = useState<OptionItem[]>([]);
  const [restrictionList, setRestrictionList] = useState<OptionItem[]>([]);
  const [addressList, setAddressList] = useState<Address[]>([]);
  const [logisticPartyList, setLogisticPartyList] = useState<OptionItem[]>([]);
  const [logisticServiceList, setLogisticServiceList] = useState<OptionItem[]>(
    []
  );
  const countryList = CountryOptions(useServerData());

  const init = async () => {
    const response = await param.params;
    setLangCode(response.locale);
    http_request("GET", "/api/cms/list/warehouse").then(async (data) => {
      const json = await data.json();
      setOptions(setWarehouseList, json);
    });
    http_request("GET", "/api/cms/list/category", {
      lang: response.locale,
    }).then(async (data) => {
      const json = await data.json();
      setOptions(setCategoryList, json);
    });
    http_request("GET", "/api/cms/list/restriction", {
      lang: response.locale,
    }).then(async (data) => {
      const json = await data.json();
      setOptions(setRestrictionList, json);
    });
    http_request("GET", "/api/cms/list/logistic-party", {
      lang: response.locale,
    }).then(async (data) => {
      const json = await data.json();
      setOptions(setLogisticPartyList, json);
      http_request("GET", "/api/cms/list/logistic-service", {
        lang: response.locale,
        service: json.data?.results[0].value || "",
      }).then(async (data) => {
        const json = await data.json();
        setOptions(setLogisticServiceList, json);
      });
    });
    http_request("GET", "/api/cms/account", {
      lang: response.locale,
    }).then(async (data) => {
      const json = await data.json();
      setOptions(setAddressList, json, "addresses");
    });
  };

  const inboundOrderStatus = [
    {
      value: "pending",
      label: t("inbound.status.pending"),
      className: "bg-gray-400",
    },
    {
      value: "received",
      label: t("inbound.status.received"),
      className: "bg-blue-400",
    },
    {
      value: "scheduled",
      label: t("inbound.status.scheduled"),
      className: "bg-gray-600",
    },
    {
      value: "outbounding",
      label: t("inbound.status.outbounding"),
      className: "bg-orange-400",
    },
    {
      value: "outbounded",
      label: t("inbound.status.outbounded"),
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
    title: "inbound.modal.create.title",
    description: "inbound.modal.create.description",
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
        readonly: [["status", "nin", ["pending", null, undefined]]],
      }),
      m_br(),
      m_multiselect(t("inbound.fields.category"), "category", categoryList, {
        is_required: true,
      }),
      m_multiselect(
        t("inbound.fields.restrictionTags"),
        "restrictionTags",
        restrictionList
      ),
      m_text(t("inbound.fields.trackingNo"), "trackingNo", {
        is_required: true,
        readonly: [["status", "nin", ["pending", null, undefined]]],
      }),
      m_text(t("inbound.fields.referenceNo"), "referenceNo", {
        is_readonly: true,
        show: [["referenceNo", "x", true]],
      }),
      m_number(t("inbound.fields.declaredValue"), "declaredValue"),
      m_textarea(t("inbound.fields.remarks"), "remarks", {
        className: "col-span-2",
      }),

      // to address
      m_switch(t("inbound.fields.isCustomToAddress"), "isCustomToAddress", {
        className: "mb-3 col-span-2",
      }),
      m_select_card(t("inbound.fields.to_address"), "addresses", {
        className: "mb-3 col-span-2",
        is_readonly: true,
        is_choose: true,
        show: [["isCustomToAddress", "in", [false, undefined, null]]],
        fields: Fields("simpleAddress"),
      }),

      m_address(t("inbound.fields.to_address"), "to", {
        is_required: true,
        className: "col-span-2",
        show: [["isCustomToAddress", true]],
      }),

      // from address
      m_switch(t("inbound.fields.is_add_from_address"), "isAddFromAddress", {
        className: "mb-3 col-span-2",
      }),

      m_address(t("inbound.fields.from_address"), "from", {
        is_required: false,
        className: "col-span-2",
        show: [["isAddFromAddress", true]],
      }),

      m_title(t("inbound.fields.dimension")),
      m_number(t("inbound.fields.width"), "width", {
        is_readonly: true,
      }),
      m_number(t("inbound.fields.height"), "height", {
        is_readonly: true,
      }),
      m_number(t("inbound.fields.length"), "length", {
        is_readonly: true,
      }),
      m_number(t("inbound.fields.weight"), "weight", {
        is_readonly: true,
      }),
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
        actions: ["POST:/api/cms/inbound", "refresh_table"],
      },
    ],
    default: {
      status: "pending",
      addresses: addressList,
      isCustomToAddress: addressList?.length == 0,
    },
  };

  const modalEdit = {
    id: "modal_edit",
    title: "inbound.modal.edit.title",
    description: "inbound.modal.edit.description",
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
        actions: ["PUT:/api/cms/inbound", "refresh_table"],
      },
    ],
    default: {
      isCustomToAddress: true,
      isAddFromAddress: true,
    },
    options: {
      readonly: [["status", "nin", ["pending", "received"]]],
    },
  };

  const modalOutbound = {
    id: "modal_outbound",
    title: "inbound.modal.outbound.title",
    description: "inbound.modal.outbound.description",
    fields: [
      m_alert("{n} " + t("table.item_selected"), {
        variant: "info",
        description: t("inbound.modal.outbound.alarm"),
        className: "border-blue-500/10 text-blue-500 bg-blue-50",
      }),
      m_title(t("utils.basic")),

      m_select(t("utils.warehouseCode"), "warehouseCode", warehouseList, {
        is_readonly: true,
        is_required: true,
      }),
      m_select(
        t("outbound.fields.logisticParty"),
        "logisticParty",
        [...logisticPartyList],
        {
          onChange: (_: any, setModalDataByKeys: any, service: string) => {
            setModalDataByKeys({
              logisticService: "",
            });
            setLogisticServiceList([]);
            http_request("GET", "/api/cms/list/logistic-service", {
              lang: langCode,
              service,
            }).then(async (data) => {
              const json = await data.json();
              setOptions(setLogisticServiceList, json);
            });
          },
        }
      ),

      m_select(
        t("outbound.fields.logisticService"),
        "logisticService",
        logisticServiceList
      ),

      // to address
      m_title(t("inbound.fields.to_address")),
      m_select_card(t("inbound.fields.to_address"), "addresses", {
        className: "mb-3 col-span-2",
        is_readonly: true,
        is_choose: true,
        show: [["isCustomToAddress", "in", [false, undefined, null]]],
        fields: Fields("simpleAddress"),
      }),
      m_switch(t("inbound.fields.isCustomToAddress"), "isCustomToAddress", {
        className: "mb-3 col-span-2",
      }),
      m_text(t("utils.contactPerson"), "to.contactPerson", {
        show: [["isCustomToAddress", true]],
        is_required: true,
      }),
      m_text(t("utils.mobile"), "to.mobile", {
        show: [["isCustomToAddress", true]],
        is_required: true,
      }),
      m_select(t("utils.country"), "to.country", countryList, {
        show: [["isCustomToAddress", true]],
        is_required: true,
      }),
      m_text(t("utils.region"), "to.region", {
        show: [["isCustomToAddress", true]],
        is_required: true,
      }),
      m_text(t("utils.state"), "to.state", {
        show: [["isCustomToAddress", true]],
        is_required: true,
      }),
      m_text(t("utils.city"), "to.city", {
        show: [["isCustomToAddress", true]],
      }),
      m_text(t("utils.district"), "to.district", {
        show: [["isCustomToAddress", true]],
        is_required: true,
      }),
      m_text(t("utils.zip"), "to.zip", {
        show: [["isCustomToAddress", true]],
      }),
      m_text(t("utils.address"), "to.address", {
        show: [["isCustomToAddress", true]],
        is_required: true,
        className: "col-span-2 mb-3",
      }),
    ],
    buttons: [
      {
        text: t("button.create"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: ["POST:/api/cms/outbound", "refresh_table"],
      },
    ],
    default: {
      isCustomToAddress: true,
      addresses: addressList,
      logisticParty: "yunexpress",
    },
  };

  const table = {
    api: "GET:/api/cms/inbound",
    params: {},
    columns: [
      c_select(),
      c_text(t("inbound.fields.orderId"), "orderId", {
        className: "max-w-[300px] line-clamp-1",
      }),
      c_text(t("inbound.fields.trackingNo"), "trackingNo"),
      c_status(t("utils.status"), "status", inboundOrderStatus, {
        filter: true,
      }),
      c_status(t("utils.warehouseCode"), "warehouseCode", warehouseList, {
        filter: true,
      }),
      c_text(t("inbound.fields.to_address"), "toFullAddress"),

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
        text: t("inbound.page.title"),
        className: "text-white",
        modal: "modal_create",
      },
      {
        icon: IconPlus,
        type: "button",
        text: t("outbound.page.title"),
        className: "text-white",
        prepare: (table: any) => {
          const selectedItem = table?.data.filter(
            (item: any) => item.isSelected
          );
          if (!selectedItem || selectedItem.length === 0) {
            throw new ApiError("NO_INBOUND_SELECTED", { n: "1" });
          }
          // find unique warehouseCode
          const warehouseCodes = [
            ...new Set(selectedItem.map((item: any) => item.warehouseCode)),
          ];
          if (warehouseCodes.length > 1) {
            throw new ApiError("MULTIPLE_WAREHOUSE_CODE_SELECTED", {
              n: "1",
              langCode,
            });
          }
          const warehouseCode = warehouseCodes[0];
          const to = selectedItem[0].to;
          return {
            n: selectedItem.length,
            inboundRequestIds: selectedItem.map((item: any) => item.orderId),
            warehouseCode,
            to,
          };
        },
        modal: "modal_outbound",
      },
    ],
    modals: [modalCreate, modalEdit, modalOutbound],
    table,
    init,
  };
  return <PageLayout {...props}></PageLayout>;
}

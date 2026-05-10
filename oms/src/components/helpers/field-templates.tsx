import { useServerData } from "@/app/providers/ServerDataContext";
import {
  IconDeviceMobile,
  IconMapPin,
  IconUserCircle,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { m_select, m_text, m_textarea } from "../modal/custom-modal-item";
import { CountryOptions } from "./utils";

const address = (t: any, countrys: any) => [
  m_text(t("utils.contactPerson"), "contactPerson", { is_required: true }),
  m_text(t("utils.mobile"), "mobile", { is_required: true }),
  m_select(t("utils.country"), "country", countrys, { is_required: true }),
  m_text(t("utils.region"), "region"),
  m_text(t("utils.state"), "state"),
  m_text(t("utils.city"), "city", { is_required: true }),
  m_text(t("utils.district"), "district", { is_required: true }),
  m_text(t("utils.zip"), "zip"),
  m_textarea(t("utils.address"), "address", {
    is_required: true,
    className: "col-span-2 mb-4",
  }),
];

const addresses = (t: any, countryList: any) => [
  m_text(t("utils.contactPerson"), "contactPerson", { is_required: true }),
  m_text(t("utils.addressID"), "id", { is_readonly: true }),
  m_select(t("utils.country"), "country", countryList, {
    is_required: true,
  }),
  m_text(t("utils.mobile"), "mobile", { is_required: true }),
  m_text(t("utils.city"), "city", { is_required: true }),
  m_text(t("utils.region"), "region", { is_required: true }),
  m_text(t("utils.district"), "district", { is_required: true }),
  m_text(t("utils.state"), "state", { is_required: true }),
  m_text(t("utils.zip"), "zip"),
  m_textarea(t("utils.address"), "address", {
    is_required: true,
    className: "col-span-2 mb-4",
  }),
];

const simpleAddress = (t: any) => [
  {
    type: "plain",
    key: "contactPerson",
    className: "opacity-80",
    l_icon: (
      <div className="mr-1 opacity-50" title={t("utils.contactPerson")}>
        <IconUserCircle stroke={1} />
      </div>
    ),
  },
  {
    type: "plain",
    key: "mobile",
    className: "opacity-80",
    l_icon: (
      <div className="mr-1 opacity-50" title={t("utils.mobile")}>
        <IconDeviceMobile stroke={1} />
      </div>
    ),
  },
  {
    type: "plain",
    key: "fullAddress",
    className: "col-span-2 mb-4 opacity-80",
    l_icon: (
      <div className="mr-1 opacity-50" title={t("utils.address")}>
        <IconMapPin stroke={1} />
      </div>
    ),
  },
];

export function Fields(key: string) {
  const t = useTranslations();
  const countrys = CountryOptions(useServerData());
  switch (key) {
    case "address":
      return address(t, countrys);

    case "addresses":
      return addresses(t, countrys);

    case "simpleAddress":
      return simpleAddress(t);
  }
}

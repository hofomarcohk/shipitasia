import { ApiErrorList as error } from "@/cst/error-list";
import { Buttons as button } from "./buttons";
import { Category as category } from "./category";
import { Client as client } from "./clients";
import { Country as country } from "./country";
import { Inbound as inbound } from "./inbound";
import { Index as index } from "./index";
import { Location as location } from "./location";
import { Login as login } from "./login";
import { Logout as logout } from "./logout";
import { Menu as menu } from "./menu";
import { Outbound as outbound } from "./outbound";
import { OutboundPack as pack } from "./outbound-pack";
import { Pda as pda } from "./pda";
import { PdaMenu as pdaMenu } from "./pda-menu";
import { Restriction as restriction } from "./restriction";
import { Table as table } from "./table";
import { Utils as utils } from "./utils";
import { Warehouse as warehouse } from "./warehouse";

type TextType = {
  [key: string]: {
    [key: string]: {
      [key: string]: any;
    };
  };
};

export const DisplayText: TextType = {
  button,
  client,
  inbound,
  index,
  login,
  menu,
  table,
  utils,
  error,
  logout,
  pdaMenu,
  pda,
  warehouse,
  country,
  category,
  restriction,
  location,
  outbound,
  pack,
};

export function lang(key: string, langCode?: string, options?: any): string {
  const keyPath = key.split(".");
  if (!langCode) {
    langCode = getCurrentLangCode();
  }
  let text: any = { ...DisplayText };
  for (const k of keyPath) {
    if (!text[k]) {
      return key;
    }
    text = text[k];
  }

  let langText = text[langCode] || key;
  for (const option in options) {
    langText = langText.replace(`{${option}}`, options[option]);
  }
  return langText;
}

export function getCurrentLangCode(): string {
  if (typeof window === "undefined") {
    return "en";
  }
  const path = window.location.pathname;
  const langCode = path.startsWith("/zh-cn")
    ? "zh-cn"
    : path.startsWith("/zh-hk")
    ? "zh-hk"
    : "en";
  return langCode;
}

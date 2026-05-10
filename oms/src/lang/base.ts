import { ApiErrorList as error } from "@/cst/error-list";
import { Account as account } from "./account";
import { Api as api } from "./api";
import { AutoOutbound as autoOutbound } from "./auto-outbound";
import { Bill as bill } from "./bill";
import { Buttons as button } from "./buttons";
import { Client as client } from "./clients";
import { Inbound as inbound } from "./inbound";
import { Index as index } from "./index";
import { Login as login } from "./login";
import { Logout as logout } from "./logout";
import { Menu as menu } from "./menu";
import { Outbound as outbound } from "./outbound";
import { Table as table } from "./table";
import { Utils as utils } from "./utils";

type TextType = {
  [key: string]: {
    [key: string]: {
      [key: string]: any;
    };
  };
};

export const DisplayText: TextType = {
  account,
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
  outbound,
  autoOutbound,
  bill,
  api,
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
  if (typeof window === "undefined") return "en";

  const path = window.location.pathname;
  const langCode = path.startsWith("/zh-cn")
    ? "zh_cn"
    : path.startsWith("/zh-hk")
    ? "zh_hk"
    : "en";
  return langCode;
}

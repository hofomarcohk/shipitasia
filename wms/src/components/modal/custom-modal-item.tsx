import { ApiError } from "@/app/api/api-error";
import { Fields } from "../helpers/field-templates";

const m_title = (text: string, options: any = {}) => {
  return { type: "title", text, ...options };
};

const m_plain = (text: string, key: string, options: any = {}) => {
  return { type: "plain", key, text, ...options };
};

const m_text = (text: string, key: string, options: any = {}) => {
  return { type: "text", key, text, ...options };
};

const m_checkbox = (text: string, key: string, options: any = {}) => {
  return { type: "checkbox", key, text, ...options };
};

const m_int = (text: string, key: string, options: any = {}) => {
  options.min = options.min || 0;
  options.max = options.max || 200000000;
  options.is_int = true;
  return { type: "number", key, text, ...options };
};

const m_number = (text: string, key: string, options: any = {}) => {
  return { type: "number", key, text, ...options };
};

const m_hr = (options: any = {}) => {
  return { type: "hr", text: "", ...options };
};

const m_br = (options: any = {}) => {
  return { type: "br", text: "", ...options };
};

const m_date = (text: string, key: string, options: any = {}) => {
  return { type: "date", key, text, ...options };
};

const m_email = (text: string, key: string, options: any = {}) => {
  return { type: "email", key, text, ...options };
};

const m_select = (text: string, key: string, data: any, options: any = {}) => {
  return { type: "select", key, text, data, ...options };
};

const m_textarea = (text: string, key: string, options: any = {}) => {
  return { type: "textarea", key, text, ...options };
};

const m_table = (text: string, key: string, options: any = {}) => {
  if (!options.columns || options.columns.length === 0) {
    throw new ApiError("MISSING_FORM_CONFIG", {
      key: key,
      attribute: "columns",
    });
  }
  return { type: "table", key, text, ...options };
};

const m_multiselect = (
  text: string,
  key: string,
  data: any,
  options: any = {}
) => {
  return { type: "multiselect", key, text, data, ...options };
};

const m_address = (text: string, key: string, options: any = {}) => {
  return {
    type: "card",
    key,
    text,
    fields: Fields("address"),
    ...options,
  };
};

const m_switch = (text: string, key: string, options: any = {}) => {
  return { type: "switch", key, text, ...options };
};

const m_cards = (text: string, key: string, options: any = {}) => {
  return { type: "cards", key, text, ...options };
};

const m_select_card = (text: string, key: string, options: any = {}) => {
  return { type: "select_card", key, text, ...options };
};

const m_image = (text: string, key: string, options: any = {}) => {
  return { type: "image", key, text, ...options };
};

const m_avatar = (text: string, key: string, options: any = {}) => {
  return { type: "avatar", key, text, ...options };
};

const m_alert = (text: string, options: any = {}) => {
  return { type: "alert", text, ...options };
};

const m_password = (text: string, key: string, options: any = {}) => {
  return { type: "password", key, text, ...options };
};

const m_split = (
  text: string,
  key: string,
  splits: any[],
  options: any = {}
) => {
  return { type: "split", key, text, splits, ...options };
};

const m_tab = (text: string, key: string, tabs: any[], options: any = {}) => {
  return { type: "tab", key, text, tabs, ...options };
};

const m_button = (text: string, key: string, options: any = {}) => {
  return { type: "button", key, text, ...options };
};

const m_icon = (text: string, key: string, options: any = {}) => {
  return { type: "icon", key, text, ...options };
};

const m_icon_more = (
  text: string,
  key: string,
  list: any[],
  options: any = {}
) => {
  return { type: "icon_more", key, text, list, ...options };
};

const m_custom = (text: string, key: string, options: any = {}) => {
  return { type: "custom", key, text, ...options };
};

export {
  m_address,
  m_alert,
  m_avatar,
  m_br,
  m_button,
  m_cards,
  m_checkbox,
  m_custom,
  m_date,
  m_email,
  m_hr,
  m_icon,
  m_icon_more,
  m_image,
  m_int,
  m_multiselect,
  m_number,
  m_password,
  m_plain,
  m_select,
  m_select_card,
  m_split,
  m_switch,
  m_tab,
  m_table,
  m_text,
  m_textarea,
  m_title,
};

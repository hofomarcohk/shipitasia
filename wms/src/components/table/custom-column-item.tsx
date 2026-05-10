import { lang } from "@/lang/base";

const c_select = (title: string = "", id: string = "select") => {
  return {
    id,
    type: "select",
    title,
  };
};

const c_text = (
  title: string = "",
  id: string = "text",
  options: any = {
    className: "max-w-[300px] line-clamp-1",
  }
) => {
  return {
    id,
    type: "text",
    title,
    ...options,
  };
};

const c_boolean = (
  title: string = "",
  id: string = "boolean",
  options: any = {}
) => {
  return {
    id,
    type: "boolean",
    title,
    ...options,
    data: [
      {
        value: "true",
        label: lang("utils.yes", options.langCode),
      },
      {
        value: "false",
        label: lang("utils.no", options.langCode),
      },
    ],
  };
};

const c_status = (
  title: string = "",
  id: string = "status",
  data: any = [],
  options: any = {}
) => {
  return {
    id,
    type: "status",
    title,
    data,
    ...options,
  };
};

const c_actions = (actions: any, options: any = {}) => {
  return {
    id: "actions",
    type: "actions",
    title: "",
    actions,
    ...options,
  };
};

const c_date = (title: string = "", id: string = "text", options: any = {}) => {
  return {
    id,
    type: "date",
    title,
    ...options,
  };
};

export { c_actions, c_boolean, c_date, c_select, c_status, c_text };

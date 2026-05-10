// import { auth } from "@/../auth";
import { lang } from "@/lang/base";
import moment from "moment";
import { NextRequest } from "next/server";
import { ApiError } from "./api-error";

export async function getParam(req: NextRequest): Promise<any> {
  let params: any = {};
  switch (req.method.toUpperCase()) {
    case "GET":
      req.nextUrl.searchParams.forEach((value, key) => {
        const paramKey = key.replace(/\?/g, "");
        if (paramKey.match(/(.*)\[(\d+)\]/)) {
          const match = paramKey.match(/(.*)\[(\d+)\]/);
          if (match) {
            const key = match[1];
            const index = match[2];
            if (!params[key]) {
              params[key] = [];
            }
            params[key][index] = value;
          }
        } else {
          params[key.replace(/\?/g, "")] = value;
        }
      });
      break;
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
      try {
        params = await req.json();
      } catch {
        // Some clients send DELETE / PATCH without a body — treat as empty.
        params = {};
      }
      break;
    default:
  }
  return params;
}

type fieldRules = {
  [key: string]: {
    required?: boolean;
    text: string;
    type?: string;
    langCode?: string;
  };
};

export function validateParams(
  params: any,
  fieldRules: fieldRules,
  langCode = "en"
) {
  let invalidFields: string[] = [];
  let missingFields: string[] = [];

  // validate required fields
  Object.keys(fieldRules).forEach((field) => {
    let data: any = null;
    const text = lang(fieldRules[field].text);
    field.split(".").forEach((key) => {
      // get data
      if (data === null) {
        data = params[key];
      } else if (data) {
        data = data[key];
      }
    });
    if (fieldRules[field].required) {
      if (data === null || data === undefined || data === "") {
        missingFields.push(text);
        data = null; // by pass the following checking
      }
    }
    // validate type
    if (field == "email" && !fieldRules[field].required) {
      console.log("email222:", data);
    }
    if (data && fieldRules[field].type) {
      const text = lang(fieldRules[field].text);
      switch (fieldRules[field].type) {
        case "string[]":
          if (!Array.isArray(data)) {
            invalidFields.push(text);
            break;
          }
          if (data.length === 0 && fieldRules[field].required) {
            missingFields.push(text);
          }
          break;
        case "date":
          if (!moment(data, "YYYY-MM-DD", true).isValid()) {
            invalidFields.push(text);
          }
          break;
        case "datetime":
          if (!moment(data, true).isValid()) {
            invalidFields.push(text);
          }
          break;
        case "number":
          if (isNaN(data)) {
            invalidFields.push(text);
          }
          break;
        case "inetger":
          if (!Number.isInteger(data)) {
            invalidFields.push(text);
          }
          break;
        case "email":
          const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
          if (!emailRegex.test(data)) {
            invalidFields.push(text);
          }
          break;
      }
    }
  });

  if (missingFields.length > 0) {
    throw new ApiError("MISSING_FIELD", {
      field: missingFields.join(", "),
    });
  }
  if (invalidFields.length > 0) {
    throw new ApiError("INVALID_FIELD", {
      field: invalidFields.join(", "),
    });
  }
  return true;
}

export function formRulesByLang(
  fieldRules: fieldRules,
  langs: string[],
  commonAttrs = {}
) {
  let returnRules: fieldRules = {};
  const langMap: { [key: string]: string } = {
    en: "EN",
    zt: "繁",
    zh: "簡",
  };

  langs.forEach((lang) => {
    Object.keys(fieldRules).forEach((field) => {
      let text: string = fieldRules[field].text.replace("{L}", langMap[lang]);
      returnRules[field.replace("{l}", lang)] = {
        ...fieldRules[field],
        ...commonAttrs,
        text: fieldRules[field].text.replace("{L}", langMap[lang]),
      };
    });
  });

  return returnRules;
}

export function formRules(fieldRules: fieldRules, commonAttrs = {}) {
  let returnRules: fieldRules = {};

  Object.keys(fieldRules).forEach((field) => {
    returnRules[field] = {
      ...commonAttrs,
      ...fieldRules[field],
    };
  });

  return returnRules;
}

export function matchBuilder(param: any, queryConfig: any) {
  let filter: any = {};
  Object.keys(queryConfig).map((key) => {
    const config = queryConfig[key];
    if (param[key]) {
      if (!filter["$and"]) {
        filter["$and"] = [];
      }
      if (!Array.isArray(config.field)) {
        config.field = [config.field];
      }
      switch (config.type) {
        case "search":
          filter["$and"].push({
            $or: config.field.map((field: string) => {
              return {
                [field]: { $regex: param[key], $options: "i" },
              };
            }),
          });
          break;

        case "in":
          filter["$and"].push({
            $or: config.field.map((field: string) => {
              if (Array.isArray(param[key])) {
                return {
                  [field]: { $in: param[key] },
                };
              }
              return {
                [field]: { $in: param[key].split(",") },
              };
            }),
          });
          break;

        case "in_boolean":
          filter["$and"].push({
            $or: config.field.map((field: string) => {
              if (Array.isArray(param[key])) {
                return {
                  [field]: { $in: param[key].map((v: string) => v === "true") },
                };
              }
              return {
                [field]: {
                  $in: param[key].split(",").map((v: string) => v === "true"),
                },
              };
            }),
          });
          break;

        case "nin":
          filter["$and"].push({
            $or: config.field.map((field: string) => {
              if (Array.isArray(param[key])) {
                return {
                  [field]: { $nin: param[key] },
                };
              }
              return {
                [field]: { $nin: param[key].split(",") },
              };
            }),
          });
          break;

        case "==":
          filter["$and"].push({
            $or: config.field.map((field: string) => {
              return {
                [field]: param[key],
              };
            }),
          });
          break;

        case "!=":
          filter["$and"].push({
            $or: config.field.map((field: string) => {
              return {
                [field]: { $ne: param[key] },
              };
            }),
          });
          break;

        default:
          break;
      }
    }
  });
  return filter;
}

export function sortBuilder(param: any, sortableColumns: string[]) {
  let sort: { [key: string]: 1 | -1 } = {
    updatedAt: -1,
  };
  sortableColumns.map((column) => {
    const sorkKey = `sort[${column}]`;
    if (param[sorkKey]) {
      sort = {
        [column]: param[sorkKey] === "asc" ? 1 : -1,
      };
    }
  });

  return sort;
}

export async function getLang(req: NextRequest): Promise<any> {
  const langCode = req.headers.get("langCode") || "en";
  return langCode;
}

export function fieldExtract<T>(data: T, fields: (keyof T)[]): Partial<T> {
  let result: Partial<T> = {};
  fields.forEach((field) => {
    if (data[field] !== undefined) {
      result[field] = data[field];
    }
  });
  return result;
}

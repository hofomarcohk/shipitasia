import { getCurrentLangCode, lang } from "@/lang/base";
import { get_request, post_request } from "@/lib/httpRequest";
import { Dispatch, SetStateAction } from "react";

export const fetchInboundRequestList = async (
  setData: Dispatch<SetStateAction<any>>,
  filter: any
) => {
  const response = await get_request("/api/wms/inbound", filter);
  const json = await response.json();
  if (json.status == 200) {
    setData(json.data.results);
  }
  return json;
};

export const fetchUser = async (setUser: Dispatch<SetStateAction<any>>) => {
  const response = await get_request("/api/wms/account");
  const json = await response.json();
  setUser(
    json.data || {
      username: "--",
      firstName: "--",
      lastName: "",
      email: "--",
      warehouse: "N/A",
    }
  );
  return json;
};

export const fetchLocationList = async (
  setData: Dispatch<SetStateAction<any[]>>,
  filter: any
) => {
  const response = await get_request("/api/wms/warehouse/location", filter);
  const json = await response.json();
  if (json.status == 200) {
    setData(json.data.results);
  }
  return json;
};

export const fetchLocationCheck = async (
  setData: Dispatch<SetStateAction<any[]>>,
  filter: any
) => {
  const response = await get_request("/api/wms/pda/warehouse/location", filter);
  const json = await response.json();
  if (json.status == 200) {
    setData(json.data.results);
  }
  return json;
};

export const fetchInventoryCheck = async (
  setData: Dispatch<SetStateAction<any[]>>,
  filter: any
) => {
  const response = await get_request(
    "/api/wms/pda/warehouse/inventory/check",
    filter
  );
  const json = await response.json();
  if (json.status == 200) {
    setData(json.data.results);
  }
  return json;
};

export const fetchGet = async (
  url: string,
  data: any = {},
  options: {
    set?: Dispatch<SetStateAction<any[]>>;
    [key: string]: any;
  } = {}
) => {
  const langCode = getCurrentLangCode();
  const req = await get_request(url, data, {
    lang: langCode,
  });

  if (!req.ok) {
    return {
      status: req.status,
      message: lang("error.STATUS_" + req.status, langCode),
    };
  }

  const json = await req.json();
  if (json.status == 200) {
    options?.set?.(json.data.results);
  }
  return json;
};

export const fetchPost = async (url: string, data: any) => {
  const langCode = getCurrentLangCode();
  const req = await post_request(url, data, {
    lang: langCode,
  });
  return req.ok
    ? await req.json()
    : {
        status: req.status,
        message: lang("error.STATUS_" + req.status, langCode),
      };
};

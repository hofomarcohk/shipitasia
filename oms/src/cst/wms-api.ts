import { WmsApi } from "@/types/Api";

export const wmsApis: {
  [key: string]: WmsApi;
} = {
  CREATE_INBOUND: {
    method: "POST",
    url: "/api/v1.0/inbound",
  },
  CREATE_OUTBOUND: {
    method: "POST",
    url: "/api/v1.0/outbound",
  },
};

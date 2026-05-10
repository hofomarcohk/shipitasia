import { CmsApi } from "@/types/Api";
import { newOutgoingApi } from "./handle_outgoing_api_log";

const endpoint = process.env.SHIPPING_SERVICE_URL;

export async function callShippingServiceApi(
  staffId: string,
  api: CmsApi,
  body: any,
  options: any = {}
) {
  const method = api.method,
    url = api.url;

  options.header = {
    ...options.header,
  };
  return await newOutgoingApi(staffId, method, endpoint + url, body, options);
}

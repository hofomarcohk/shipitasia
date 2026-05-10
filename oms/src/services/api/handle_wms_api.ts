import { WmsApi } from "@/types/Api";
import { getSignature } from "../login/auth";
import { redisGetSet } from "../utils/redis";
import { newOutgoingApi } from "./handle_outgoing_api_log";

const endpoint = process.env.WMS_URL;

export async function callWmsApi(
  clientId: string,
  api: WmsApi,
  body: any,
  options: any = {}
) {
  const method = api.method,
    url = api.url;
  const apiKey = process.env.WMS_API_KEY || "";
  const timestamp = new Date().getTime().toString();
  const signature = await getSignature(
    apiKey,
    timestamp,
    process.env.WMS_API_SECRET || ""
  );

  const token = await redisGetSet("WMS_API_TOKEN", clientId, async () => {
    const call = await newOutgoingApi(
      clientId,
      "GET",
      endpoint + "/api/v1.0/auth/getToken",
      {},
      {
        header: {
          "x-api-key": apiKey,
          "x-timestamp": timestamp,
          "x-signature": signature,
        },
      }
    );

    const json = call.responseJson;
    if (json?.status && json.status == 200) {
      return json.data.token;
    }
    return "";
  });

  options.header = {
    ...options.header,
    "x-api-key": apiKey,
    "x-timestamp": timestamp,
    Authorization: `Bearer ${token}`,
  };
  return await newOutgoingApi(clientId, method, endpoint + url, body, options);
}

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { countryCodes } from "@/cst/yun-express";
import { connectToDatabase } from "@/lib/mongo";
import { WmsApi, YunExpressToken } from "@/types/Api";
import crypto from "crypto";
import { Agent } from "https";
import { ObjectId } from "mongodb";
import { env } from "process";
import { redisGetSet } from "../utils/redis";
import { newOutgoingApi } from "./handle_outgoing_api_log";

const endpoint = process.env.YUN_EXPRESS_API_URL || "";

async function getToken(clientId: string, appId: string, appSecret: string) {
  const data = {
    grantType: "client_credentials",
    appId,
    appSecret,
    sourceKey: env.YUN_API_SOURCE_KEY,
  };
  try {
    const response = await newOutgoingApi(
      clientId,
      "POST",
      endpoint + "/openapi/oauth2/token",
      data,
      {
        header: { "Content-Type": "application/json" },
        httpsAgent: new Agent({ rejectUnauthorized: false }),
      }
    );

    return response;
  } catch (error: any) {
    console.error("Error fetching token:", error.message);
    throw error;
  }
}

function calculationSignature(content: string, secret: string) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(content);
  return hmac.digest("base64");
}

function generateSignatureContent(
  date: number,
  method: string,
  uri: string,
  body: any = null
) {
  const params: any = {
    date,
    method,
    uri,
  };

  if (body !== null) {
    params.body = body;
  }

  const sortedKeys = Object.keys(params).sort();
  const sortedParams = sortedKeys.map((key) => {
    if (key == "body") {
      return `${encodeURIComponent(key)}=${encodeURIComponent(
        JSON.stringify(params[key])
      )}`;
    }
    return `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
  });

  return decodeURIComponent(sortedParams.join("&"));
}

export async function callYunApi(
  clientId: string,
  api: WmsApi,
  body: any = {},
  options: any = {}
) {
  const method = api.method;
  const url = api.url;
  const date = Date.now();

  const db = await connectToDatabase();

  const client = await redisGetSet("YUN_API_TOKEN", clientId, async () => {
    return await db.collection(collections.CLIENT).findOne({
      _id: new ObjectId(clientId),
    });
  });
  if (!client) {
    throw new ApiError("CLIENT_NOT_FOUND");
  }
  const token = client.externalTokens.find(
    (token: YunExpressToken) =>
      token.platform === "yunexpress" && token.isActive
  );

  if (!token) {
    throw new ApiError("API_TOKEN_NOT_FOUND");
  }

  const appId = token.appId; //token.appId;
  const appSecret = token.secret; //token.secret;

  const content = generateSignatureContent(
    date,
    method,
    url,
    Object.keys(body).length === 0 ? null : body
  );
  const sign = calculationSignature(content, appSecret);

  const yunToken = (await getToken(clientId, appId, appSecret)).responseJson
    .accessToken;

  options.header = {
    date,
    sign,
    token: yunToken,
    ...options.header,
  };

  return await newOutgoingApi(clientId, method, endpoint + url, body, options);
}

// APIs
export async function getYunCountryList(clientId: string, platform: string) {
  const url = { method: "GET", url: "/v1/basic-data/countries/getlist" };
  return await callYunApi(clientId, url);
}

export async function getYunProduct(clientId: string, langCode: string) {
  const langMap: { [key: string]: string } = {
    en: "en_US",
    "zh-hk": "zh-HK",
    "zh-cn": "zh-CN",
  };

  const url = { method: "GET", url: "/v1/basic-data/products/getlist" };
  const header = { "Accept-Language": langMap[langCode] ?? "en_US" };
  return await callYunApi(clientId, url, {}, { header });
}

export async function createYunB2bOrder(
  clientId: string,
  outboundOrder: any,
  boxNoList: any
) {
  if (!countryCodes[outboundOrder.to.country as string]) {
    throw new ApiError("INVALID_YUN_COUNTRY_CODE", {
      field: outboundOrder.to.country,
    });
  }
  const country_code = countryCodes[outboundOrder.to.country];
  const data = {
    customer_order_number: outboundOrder.orderId,
    product_code: outboundOrder.logisticService, //"B2BUAT",
    country_code,
    currency: "USD",
    extra_services: [],
    receiver: {
      city: outboundOrder.to.city,
      address_type: 2, // 地址类型 ormat：int32 枚举：0,1,2,3 枚举备注：0：未配置；1:亚马逊地址；2：私人地址; 3:海外仓地址
      name: outboundOrder.to.contactPerson,
      postal_code: outboundOrder.to.zip,
      province: outboundOrder.to.state,
      street: outboundOrder.to.address,
      street2: outboundOrder.to.district,
      country_code, //"RT",
      phone_number: outboundOrder.to.mobile,
    },

    packages: boxNoList.map((b: any) => ({
      box_number: b.boxNo,
      length: b.length,
      width: b.width,
      height: b.height,
      weight: b.weight,
      declaration_info: [
        // {
        //   hs_code: "HS123456789",
        //   goods_url: "https://example.com/product",
        //   name_cn: "",
        //   name_en: "Product Name",
        //   remark: "Product remark",
        //   quantity: 1,
        //   unit_price: "100.00",
        //   unit_weight: 1,
        //   purpose: "Gift",
        //   material: "Plastic",
        //   brand: "Brand X",
        //   model: "Model A",
        //   quantity_unit: "PC",
        // },
      ],
    })),
    delivery_info: {
      delivery_type: 1,
    },
  };
  const url = { method: "POST", url: "/v1/order/b2b/create" };
  return await callYunApi(clientId, url, data);
}

export async function createYunOrder(
  clientId: string,
  outboundOrder: any,
  boxNoList: any
) {
  if (!countryCodes[outboundOrder.to.country as string]) {
    throw new ApiError("INVALID_YUN_COUNTRY_CODE", {
      field: outboundOrder.to.country,
    });
  }
  const country_code = countryCodes[outboundOrder.to.country];

  const data = {
    product_code: outboundOrder.logisticService, // handle product_code "S1002"
    customer_order_number: outboundOrder.orderId,
    country_code, // handle country code
    packages: boxNoList.map((b: any) => ({
      length: b.length,
      width: b.width,
      height: b.height,
      weight: b.weight,
    })),
    receiver: {
      first_name: outboundOrder.to.contactPerson,
      country_code, // handle country code
      city: outboundOrder.to.city,
      province: outboundOrder.to.state,
      address_lines: [outboundOrder.to.address],
      postal_code: outboundOrder.to.zip,
      phone_number: outboundOrder.to.mobile,
    },
    declaration_info: [],
  };

  const url = { method: "POST", url: "/v1/order/package/create" };
  return await callYunApi(clientId, url, data);
}

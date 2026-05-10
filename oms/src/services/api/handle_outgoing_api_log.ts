import { collections } from "@/cst/collections";
import { OutgoingApiLog } from "@/types/Log";
import { randomUUID } from "crypto";
import { mongoAdd, mongoEdit, mongoGet } from "../utils/mongodb";

const collection = collections.OUTGOING_API_LOG;

export async function addOutgoingApiLog(data: OutgoingApiLog) {
  data.createdAt = new Date();
  return await mongoAdd(collection, data);
}

export async function editOutgoingApiLog(
  condition: any,
  data: Partial<OutgoingApiLog>
) {
  return await mongoEdit(collection, condition, { $set: data });
}

export async function newOutgoingApi(
  clientId: string,
  method: string,
  url: string,
  body: any,
  options: any = {}
) {
  const requestId = randomUUID();
  const headers = options.header || {};
  const retry = options.retry || 0;
  const now = new Date();
  let responses: {
    status: number;
    usedTime: number;
    response: any;
    createdAt: Date;
  }[] = [];
  let status = 0;

  // add api log
  await addOutgoingApiLog({
    requestId,
    clientId,
    method,
    url,
    headers,
    status,
    retry,
    body,
    responses,
  });

  let response = null;
  let responseJson = null;

  try {
    response = await callApi(method, url, body, options);

    // update api log
    responseJson = await response.json();
    responses.push({
      status: response.status,
      usedTime: new Date().getTime() - now.getTime(),
      response: responseJson,
      createdAt: new Date(),
    });

    if (response.status === 200) {
      status = 1;
    }
    await editOutgoingApiLog({ requestId }, { responses, status });
  } catch (error) {}

  return { ...response, responseJson };
}

export async function retryOutgoingApi(requestId: string) {
  const apiData = await mongoGet(collection, {
    requestId,
    status: 0,
    retry: { $gt: 0 },
  });
  if (!apiData) return;
  const headers = apiData.headers;
  const retry = apiData.retry - 1;
  const now = new Date();
  let responses = apiData.responses;
  let status = 0;

  const response = await callApi(apiData.method, apiData.url, apiData.body, {
    header: headers,
    retry,
  });

  // update api log
  responses.push({
    status: response.status,
    usedTime: new Date().getTime() - now.getTime(),
    response: await response.json(),
    createdAt: new Date(),
  });

  if (response.status === 200) {
    status = 1;
  }

  await editOutgoingApiLog({ requestId }, { responses, retry, status });
  return response;
}

export async function callApi(
  method: string,
  url: string,
  body: any,
  options: any = {}
) {
  const headers = options.header || {};

  switch (method) {
    case "GET":
      const apiUrl = new URL(url);
      apiUrl.search = new URLSearchParams(body).toString();

      return await fetch(apiUrl.toString(), {
        method: method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      });

    default:
      return await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      });
  }
}

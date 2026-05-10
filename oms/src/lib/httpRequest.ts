export function buildQueryString(
  obj: any,
  searchParams: URLSearchParams,
  prefix: string
) {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const fullKey = prefix ? `${prefix}[${key}]` : key;
      if (typeof obj[key] === "object" && obj[key] !== null) {
        buildQueryString(obj[key], searchParams, fullKey);
      } else {
        searchParams.set(fullKey, obj[key]);
      }
    }
  }
}

export async function http_request(
  method: string,
  url: string,
  data: any = {},
  headers: any = {}
) {
  method = method.toUpperCase();
  let req: any;
  if (method === "GET") {
    const searchParams = new URLSearchParams();
    buildQueryString(data, searchParams, "");
    let requestUrl = `${url}?${searchParams.toString()}`.replace(/\?$/, "");
    req = await fetch(`${requestUrl}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    });
  } else {
    req = await fetch(`${url}`, {
      method: method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(data),
    });
  }
  return req;
}

export async function post_request(
  url: string,
  data: any = {},
  headers: any = {}
) {
  return await http_request("POST", url, data, headers);
}

export async function get_request(
  url: string,
  data: any = {},
  headers: any = {}
) {
  return await http_request("GET", url, data, headers);
}

export async function put_request(
  url: string,
  data: any = {},
  headers: any = {}
) {
  return await http_request("PUT", url, data, headers);
}

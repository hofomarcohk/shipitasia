import { post_request, put_request } from "@/lib/httpRequest";

export const setActiveWarehouse = async (warehouseCode: string) => {
  const req = await put_request("/api/wms/account/warehouse", {
    warehouseCode,
  });
  const json = await req.json();
  return json;
};

export const arriveInbound = async (orderId: string) => {
  const req = await post_request("/api/wms/pda/inbound/arrive", {
    orderId,
  });
  const json = await req.json();
  return json;
};

export const receiveInbound = async (
  locationCode: string,
  orderId: string[]
) => {
  const req = await post_request("/api/wms/pda/inbound/receive", {
    locationCode,
    orderId,
  });
  const json = await req.json();
  return json;
};

export const pickingOutboundRequest = async (orderId: string) => {
  const response = await post_request("/api/wms/outbound/picking", {
    orderId,
  });
  return {
    status: 200,
    message: "success",
  };
  const json = await response.json();
  return json;
};

export const createUnknownInbound = async (
  warehouseCode: string,
  addressCode: string,
  trackingNo: string
) => {
  const req = await post_request("/api/wms/pda/inbound/createUnknownInbound", {
    warehouseCode,
    addressCode,
    trackingNo,
  });
  const json = await req.json();
  return json;
};

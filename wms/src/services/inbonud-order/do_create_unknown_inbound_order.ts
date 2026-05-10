import { collections } from "@/cst/collections";
import { callShippingServiceApi } from "../api/handle_sms_api";

const collectionInbound = collections.INBOUND;
const collectionItemLocation = collections.ITEM_LOCATION;
const collectionReceiveLog = collections.RECEIVE_LOG;

export async function createUnknownInbound(
  staffId: string,
  warehouseCode: string,
  addressCode: string,
  trackingNo: string
) {
  // call SMS API to create unknown inbound
  return await callShippingServiceApi(
    staffId,
    {
      method: "POST",
      url: "/api/wms/inbound/createOrderByAddressCode",
    },
    { warehouseCode, addressCode, trackingNo }
  );
}

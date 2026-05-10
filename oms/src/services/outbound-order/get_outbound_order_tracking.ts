import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Outbound } from "@/types/Outbound";
import { ObjectId } from "mongodb";
import { callYunApi, createYunB2bOrder } from "../api/handle_yun_api";
import { redisGetSet } from "../utils/redis";

const collection = collections.OUTBOUND;

export async function getOutboundTrackinga(
  clientId: string,
  outboundOrder: Outbound
) {
  const db = await connectToDatabase();

  const client = await redisGetSet(
    "YUN_API_TOKEN_" + clientId,
    "",
    async () => {
      return await db.collection(collections.CLIENT).findOne({
        _id: new ObjectId(clientId),
      });
    }
  );
  if (!client) {
    throw new ApiError("CLIENT_NOT_FOUND");
  }
  let trackingNo = outboundOrder.trackingNo;
  if (!outboundOrder.trackingNo || outboundOrder.trackingNo === "") {
    switch (outboundOrder.logisticParty) {
      case "yunexpress":
        const token = btoa(
          client.externalTokens.find(
            (token: { platform: string }) => token.platform === "yunexpress"
          )?.token || ""
        );

        const data = {
          product_code: "", // handle product_code
          customer_order_number: outboundOrder.orderId,
          packages: [
            // box
            {
              box_number: "box_1",
              ref_parcels: [
                {
                  sku_code: "",
                  quantity: 1,
                },
              ],
              weight: 4, // handle weight
            },
          ],
          receiver: {
            first_name: outboundOrder.to.contactPerson,
            country_code: "", // handle country code
            province: outboundOrder.to.state,
            city: outboundOrder.to.city,
            address_lines: [outboundOrder.to.address],
            postal_code: outboundOrder.to.zip,
            phone_number: outboundOrder.to.mobile,
          },
          declaration_info: [
            {
              quantity: 1,
              unit_price: 2,
              unit_weight: 3,
              sku_code: "",
              name_en: "",
            },
          ],
        };

        return callYunApi(
          clientId,
          {
            method: "POST",
            url: "/v1/order/package/create",
          },
          data,
          { token }
        );
        break;
    }
  }

  return trackingNo;
}

export async function getOutboundTracking(
  clientId: string,
  outboundOrder: Outbound,
  boxNoList: any[]
) {
  let trackingNo = outboundOrder.trackingNo;
  if (!outboundOrder.trackingNo || outboundOrder.trackingNo === "") {
    switch (outboundOrder.logisticParty) {
      case "yunexpress":
        // return await createYunOrder(clientId, outboundOrder, boxNoList);
        return await createYunB2bOrder(clientId, outboundOrder, boxNoList);
    }
  }
  return trackingNo;
}

import { ApiError } from "@/app/api/api-error";
import { getParam } from "@/app/api/api-helper";
import { wmsMiddleware } from "@/app/api/wms/wms-middleware";
import { INBOUND } from "@/cst/inbound";
import { getClientList } from "@/services/clients/get_client_list";
import { createInbound } from "@/services/inbonud-order/do_create_inbound_order";
import { ApiReturn } from "@/types/Api";
import { Inbound } from "@/types/Inbound";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return wmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    if (!body.trackingNo || body.trackingNo.length === 0) {
      throw new ApiError("MISSING_FIELD", { field: "trackingNo" });
    }

    if (!body.addressCode || body.addressCode.length === 0) {
      throw new ApiError("MISSING_FIELD", { field: "addressCode" });
    }

    if (!body.warehouseCode || body.warehouseCode.length === 0) {
      throw new ApiError("MISSING_FIELD", { field: "warehouseCode" });
    }

    const user = await getClientList({
      "addresses.id": body.addressCode,
    });

    if (!user) {
      throw new ApiError("ADDRESS_NOT_FOUND");
    }
    const address = user.addresses.find((a: any) => a.id === body.addressCode);

    const inbound: Inbound = {
      orderId: "",
      clientId: user._id.toString(),
      source: "wms",
      warehouseCode: body.warehouseCode,
      status: INBOUND.STATUS.PENDING,
      trackingNo: body.trackingNo,
      createdAt: new Date(),
      updatedAt: new Date(),
      to: {
        contactPerson: address.contactPerson ?? "",
        mobile: address.mobile ?? "",
        country: address.country ?? "",
        region: address.region ?? "",
        state: address.state ?? "",
        city: address.city ?? "",
        district: address.district ?? "",
        address: address.address ?? "",
        zip: address.zip ?? "",
      },
    };

    await createInbound(user._id.toString(), [inbound]);

    return {
      status: 200,
      message: "success",
      data: { inbound },
    };
  });
}

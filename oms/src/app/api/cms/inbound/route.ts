import {
  getLang,
  getParam,
  matchBuilder,
  sortBuilder,
} from "@/app/api/api-helper";
import { auth, cmsMiddleware, getUser } from "@/app/api/cms/cms-middleware";
import { lang } from "@/lang/base";
import { getCountry } from "@/services/country/get_country_list";
import { formFullAddress } from "@/services/helpers/utils";
import { createInbound } from "@/services/inbonud-order/do_create_inbound_order";
import { updateInbound } from "@/services/inbonud-order/do_update_inbound_order";
import {
  countInboundRequest,
  getInboundRequest,
} from "@/services/inbonud-order/get_inbound_order_list";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const param = await getParam(request);
  const user = await getUser(request);
  return cmsMiddleware(request, param, async (): Promise<ApiReturn> => {
    auth(request, "login");
    const langCode = await getLang(request);
    const pageSize = Number(param.pageSize || "10");
    const pageNo = Number(param.pageNo || "1");
    const sort = sortBuilder(param, ["updatedAt"]);
    const match = {
      ...matchBuilder(param, {
        search: {
          type: "search",
          field: ["trackingNo", "orderId"],
        },
        scan: {
          type: "in",
          field: ["trackingNo", "orderId"],
        },
        status: {
          type: "in",
          field: "status",
        },
        warehouseCode: {
          type: "in",
          field: "warehouseCode",
        },
        category: {
          type: "in",
          field: "category",
        },
        restrictionTags: {
          type: "in",
          field: "restrictionTags",
        },
        xOrderId: {
          type: "nin",
          field: "orderId",
        },
      }),
      clientId: user._id.toString(),
      deletedAt: { $exists: false },
    };
    let count = await countInboundRequest(match);
    let results = await getInboundRequest([
      {
        $match: match,
      },
      {
        $sort: sort,
      },
      {
        $skip: (pageNo - 1) * pageSize,
      },
      {
        $limit: pageSize,
      },
    ]);
    const countryList = await getCountry([
      { $match: { deleteAt: { $exists: false } } },
    ]);
    return {
      status: 200,
      message: "Success",
      data: {
        count,
        results: results.map((r: any) => {
          r.toFullAddress = formFullAddress(r.to, countryList);
          return r;
        }),
      },
    };
  });
}

export async function POST(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const user = await getUser(request);
    const langCode = await getLang(request);

    const address = body.addresses?.filter((a: any) => a.isDefault);
    if (!body.isCustomToAddress) {
      body.to = address[0] ?? {};
    }

    delete body.addresses;
    delete body.toFullAddress;

    if (!body.willArrivedAt) {
      delete body.willArrivedAt;
    }
    delete body._id;
    delete body.isCustomToAddress;
    delete body.isAddFromAddress;
    delete body.createdAt;
    console.log("useruser", user);
    await createInbound(user._id.toString(), [
      {
        ...body,
        from: {
          contactPerson: body?.from?.contactPerson ?? "",
          mobile: body?.from?.mobile ?? "",
          country: body?.from?.country ?? "",
          region: body?.from?.region ?? "",
          state: body?.from?.state ?? "",
          city: body?.from?.city ?? "",
          district: body?.from?.district ?? "",
          address: body?.from?.address ?? "",
          zip: body?.from?.zip ?? "",
        },
        to: {
          contactPerson: body?.to?.contactPerson ?? "",
          mobile: body?.to?.mobile ?? "",
          country: body?.to?.country ?? "",
          region: body?.to?.region ?? "",
          state: body?.to?.state ?? "",
          city: body?.to?.city ?? "",
          district: body?.to?.district ?? "",
          address: body?.to?.address ?? "",
          zip: body?.to?.zip ?? "",
        },
        declaredValue: parseInt(body.declaredValue) || 0,
        width: parseFloat(body.width) || 0,
        height: parseFloat(body.height) || 0,
        length: parseFloat(body.length) || 0,
        weight: parseFloat(body.weight) || 0,
        willArrivedAt: body.willArrivedAt && new Date(body.willArrivedAt),
        updatedAt: new Date(),
      },
    ]);
    return {
      status: 200,
      message: lang("utils.createSuccess", langCode),
    };
  });
}

export async function PUT(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    const user = await getUser(request);
    const langCode = await getLang(request);
    delete body._id;
    delete body.isCustomToAddress;
    delete body.isAddFromAddress;
    delete body.createdAt;
    delete body.toFullAddress;

    if (!body.willArrivedAt) {
      delete body.willArrivedAt;
    }
    console.log("user._id.toString()", user._id.toString());
    await updateInbound(user._id.toString(), body.orderId, {
      ...body,
      from: {
        contactPerson: body?.from?.contactPerson ?? "",
        mobile: body?.from?.mobile ?? "",
        country: body?.from?.country ?? "",
        city: body?.from?.city ?? "",
        region: body?.from?.region ?? "",
        district: body?.from?.district ?? "",
        state: body?.from?.state ?? "",
        address: body?.from?.address ?? "",
        zip: body?.from?.zip ?? "",
      },
      to: {
        contactPerson: body?.to?.contactPerson ?? "",
        mobile: body?.to?.mobile ?? "",
        country: body?.to?.country ?? "",
        city: body?.to?.city ?? "",
        region: body?.to?.region ?? "",
        district: body?.to?.district ?? "",
        state: body?.to?.state ?? "",
        address: body?.to?.address ?? "",
        zip: body?.to?.zip ?? "",
      },
      declaredValue: parseInt(body.declaredValue) || 0,
      width: parseFloat(body.width) || 0,
      height: parseFloat(body.height) || 0,
      length: parseFloat(body.length) || 0,
      weight: parseFloat(body.weight) || 0,
      willArrivedAt: body.willArrivedAt && new Date(body.willArrivedAt),
      updatedAt: new Date(),
    });
    return {
      status: 200,
      message: lang("utils.updateSuccess", langCode),
    };
  });
}

export async function DELETE(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    let inbound_request = await getInboundRequest([]);
    return {
      status: 200,
      message: "Success",
      data: inbound_request,
    };
  });
}

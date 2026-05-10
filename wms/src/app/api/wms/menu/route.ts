import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { getMenu } from "@/services/menu/get_menu";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    // validate role
    const menu = (await getMenu([{
      $sort: { order: 1 },
    }])).map((item) => ({
      title: "menu."+item.name,
      url: "#",
      items: item.items.map((i: {
        name: string
        icon: string
        url: string
      }) => ({
        title: "menu."+i.name,
        icon: i.icon,
        url: i.url,
      })),
    }))
    return {
      status: 200,
      message: "Success",
      data: menu,
    };
  });
}

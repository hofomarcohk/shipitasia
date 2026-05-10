import { getParam } from "@/app/api/api-helper";
import { auth, cmsMiddleware } from "@/app/api/wms/cms-middleware";
import { getPdaMenu } from "@/services/menu-pda/get_menu";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const body = await getParam(request);
  return cmsMiddleware(request, body, async (): Promise<ApiReturn> => {
    auth(request);
    // validate role
    const menu = (await getPdaMenu([{
      $sort: { order: 1 },
    }])).map((item) => ({
      title: "pdaMenu."+item.name,
      url: item.path,
      icon: item.icon,
      items: item.items.map((i: {
        name: string
        icon: string
        url: string
      }) => ({
        title: "pdaMenu."+i.name,
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

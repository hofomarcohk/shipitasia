import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

const collection = collections.MENU;

export async function aggregateMenu(pipe: any) {
  const db = await connectToDatabase();
  return await db.collection(collection).aggregate(pipe).toArray();
}

export async function getMenu(context: "oms" | "wms" | "pda" = "oms") {
  const menu = (
    await aggregateMenu([
      { $match: { order: { $gt: 0 }, context } },
      { $sort: { order: 1 } },
    ])
  ).map((item) => ({
    title: "menu." + item.name,
    url: "#",
    items: item.items.map((i: { name: string; icon: string; url: string }) => ({
      title: "menu." + i.name,
      icon: i.icon,
      url: i.url,
    })),
  }));
  return menu;
}

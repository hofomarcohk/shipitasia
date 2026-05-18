// Sidebar badge counts — one query per menu key, returned as a flat
// dict so AppSidebar can render "{count}" next to each item. Per Marco's
// rule: badges represent "tasks waiting at this stage". Counts are
// warehouse-scoped for WMS, client-scoped for OMS.

import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

export type MenuBadgeCounts = Record<string, number>;

export async function getWmsBadgeCounts(
  warehouseCode: string
): Promise<MenuBadgeCounts> {
  const db = await connectToDatabase();
  const inbound = db.collection(collections.INBOUND);
  const outbound = db.collection(collections.OUTBOUND);
  const links = db.collection(collections.OUTBOUND_INBOUND_LINK);
  const pickBatches = db.collection(collections.PICK_BATCH);

  // ops_receive — 到倉等上架的件
  const ops_receive = await inbound.countDocuments({
    warehouseCode,
    status: "arrived",
  });

  // ops_pick_batch — 客人已建出庫單，還沒組進批次
  const ops_pick_batch = await outbound.countDocuments({
    warehouseCode,
    status: "ready_for_label",
    $or: [{ batch_id: null }, { batch_id: { $exists: false } }],
  });

  // ops_pick — 入庫件 status=received 且 outbound 在 picking 批次內
  const activeBatches = await pickBatches
    .find({ warehouseCode, status: "picking" })
    .project({ outbound_ids: 1 })
    .toArray();
  const activeOutboundIds = activeBatches.flatMap(
    (b: any) => (b.outbound_ids ?? []) as string[]
  );
  let ops_pick = 0;
  if (activeOutboundIds.length > 0) {
    const activeLinks = await links
      .find({ outbound_id: { $in: activeOutboundIds }, unlinked_at: null })
      .project({ inbound_id: 1 })
      .toArray();
    const inboundIds = activeLinks.map((l: any) => l.inbound_id);
    if (inboundIds.length > 0) {
      ops_pick = await inbound.countDocuments({
        _id: { $in: inboundIds as any },
        status: "received",
      });
    }
  }

  // ops_pack — outbound 揀完待裝箱
  const ops_pack = await outbound.countDocuments({
    warehouseCode,
    status: "picked",
  });

  // ops_weigh (秤重置板) — distinct outbounds with sealed boxes that
  // still need weighing OR palletize confirm-scan. Counts the work-in-flight
  // for the 秤重置板 station; clears to 0 only once every box has been
  // weighed AND palletize-scanned (i.e. the outbound has advanced past
  // weight_verified via /complete).
  const packBoxes = db.collection(collections.PACK_BOX_V1);
  const pendingBoxes = await packBoxes
    .find(
      {
        status: "sealed",
        $or: [
          { weighed_at: null },
          { weighed_at: { $exists: false } },
          { palletize_scanned_at: null },
          { palletize_scanned_at: { $exists: false } },
        ],
      },
      { projection: { "items.outbound_id": 1 } } as any
    )
    .toArray();
  const pendingOutboundIds = new Set<string>();
  for (const b of pendingBoxes) {
    for (const it of (b as any).items ?? []) {
      pendingOutboundIds.add(String(it.outbound_id));
    }
  }
  let ops_weigh = 0;
  if (pendingOutboundIds.size > 0) {
    ops_weigh = await outbound.countDocuments({
      warehouseCode,
      _id: { $in: [...pendingOutboundIds] as any },
      status: { $in: ["packed", "weighing", "weight_verified"] },
    });
  }

  // ops_label_print — 未取得面單(待客戶於 OMS 確認) + 已取得面單待貼標
  const ops_label_print = await outbound.countDocuments({
    warehouseCode,
    status: { $in: ["pending_client_label", "label_obtained"] },
  });

  // ops_depart — 已貼標待離倉
  const ops_depart = await outbound.countDocuments({
    warehouseCode,
    status: "label_printed",
  });

  return {
    ops_receive,
    ops_pick_batch,
    ops_pick,
    ops_pack,
    ops_weigh,
    ops_label_print,
    ops_depart,
  };
}

// OMS — counts for the current client. "Waiting on the client" states only.
// Keys MUST match menu_urls.name so the sidebar renders the badge.
export async function getOmsBadgeCounts(
  client_id: string
): Promise<MenuBadgeCounts> {
  const db = await connectToDatabase();
  // outbound_list — outbound waiting for client confirm-before-label step.
  const outbound_list = await db
    .collection(collections.OUTBOUND)
    .countDocuments({
      client_id,
      status: "pending_client_label",
    });
  return { outbound_list };
}

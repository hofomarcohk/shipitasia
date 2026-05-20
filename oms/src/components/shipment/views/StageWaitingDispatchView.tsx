"use client";

import { Input } from "@/components/ui/input";
import { useShipmentOverview } from "@/hooks/use-shipment-overview";
import { buildDetailTimeline } from "@/lib/shipment-mock";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { OutboundBoxCard } from "../OutboundBoxCard";
import { useOpenShipmentDetail } from "../ShipmentDetailProvider";
import { StageEmpty, StageError, StageLoading } from "../StageStates";
import { SubPills } from "../SubPills";
import type { ShipmentChipVariant } from "../ShipmentStatusBadge";

interface BoxItem { id: string; items: string; price: string }
interface Box { bid: string; dim: string; weight: string; items: BoxItem[] }
interface OutboundCardData {
  obid: string;
  recipient: string;
  carrier: string;
  chips: { label: string; variant: ShipmentChipVariant }[];
  totalWeight: string;
  boxCount: number;
  boxes: Box[];
  pickupAt?: string;
}

type Sub = "all" | "tomorrow" | "day_after";

export function StageWaitingDispatchView() {
  const [sub, setSub] = useState<Sub>("all");
  const [search, setSearch] = useState("");
  const openDetail = useOpenShipmentDetail();
  const { data, isLoading, error, refetch } =
    useShipmentOverview<{ rows: OutboundCardData[] }>("waiting_dispatch");
  const rows = data?.rows ?? [];

  const filtered = rows.filter((d) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      d.obid.toLowerCase().includes(q) ||
      d.recipient.toLowerCase().includes(q) ||
      d.carrier.toLowerCase().includes(q) ||
      d.boxes.some((b) =>
        b.items.some(
          (it) =>
            it.id.toLowerCase().includes(q) ||
            it.items.toLowerCase().includes(q)
        )
      )
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SubPills<Sub>
          value={sub}
          onChange={setSub}
          options={[
            { value: "all", label: "全部", count: rows.length },
            // MEDIUM-005 fix — sub-pill counts default to actual row count
            // (pickupAt-based split is server-side TBD; until then keep
            // tomorrow == all).
            { value: "tomorrow", label: "明日攬收", count: rows.length },
            { value: "day_after", label: "後日攬收", count: 0 },
          ]}
        />
        <div className="relative">
          <IconSearch
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋出庫單 / 追蹤號…"
            className="h-8 w-[260px] pl-8 text-xs"
          />
        </div>
      </div>

      {isLoading && rows.length === 0 ? (
        <StageLoading rows={3} />
      ) : error ? (
        <StageError message={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <StageEmpty title="未有待出倉嘅出庫單" />
      ) : null}
      <div className="space-y-3">
        {filtered.length === 0 && rows.length > 0 && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
            無符合條件嘅出庫單
          </div>
        )}
        {filtered.map((d) => (
          <OutboundBoxCard
            key={d.obid}
            data={d}
            showTracking
            onShowDetail={() =>
              openDetail({
                trackingNo: d.obid,
                itemSummary: `${d.boxCount} 箱 · 待 ${d.pickupAt}`,
                stageLabel: "待出倉",
                subStatusLabel: d.chips.map((c) => c.label).join(" · "),
                subStatusVariant: d.chips[0]?.variant ?? "ok",
                recipient: d.recipient,
                carrier: d.carrier,
                createdAt: "—",
                timeline: buildDetailTimeline(5),
                canEdit: false,
                canCancel: false,
                canViewDispatch: true,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

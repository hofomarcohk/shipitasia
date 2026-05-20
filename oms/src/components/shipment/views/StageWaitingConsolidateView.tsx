"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useShipmentOverview } from "@/hooks/use-shipment-overview";
import { buildDetailTimeline } from "@/lib/shipment-mock";
import { cn } from "@/lib/utils";
import { IconChevronDown, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useOpenShipmentDetail } from "../ShipmentDetailProvider";
import { ShipmentStatusBadge, type ShipmentChipVariant } from "../ShipmentStatusBadge";
import { StageEmpty, StageError, StageLoading } from "../StageStates";
import { SubPills } from "../SubPills";

interface ConsolidateOutboundChild {
  id: string;
  items: string;
  price: string;
  time: string;
}

interface ConsolidateOutbound {
  obid: string;
  total: number;
  value: string;
  recipient: string;
  carrier: string;
  sub: "not_picked" | "picked";
  subLabel: string;
  subVariant: ShipmentChipVariant;
  time: string;
  children: ConsolidateOutboundChild[];
}

type Sub = "all" | "not_picked" | "picked";

export function StageWaitingConsolidateView() {
  const [sub, setSub] = useState<Sub>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const openDetail = useOpenShipmentDetail();
  const { data, isLoading, error, refetch } =
    useShipmentOverview<{ rows: ConsolidateOutbound[] }>("waiting_consolidate");

  const allRows = data?.rows ?? [];
  const rows = allRows.filter((r) => sub === "all" || r.sub === sub);

  const counts = {
    all: allRows.length,
    not_picked: allRows.filter((r) => r.sub === "not_picked").length,
    picked: allRows.filter((r) => r.sub === "picked").length,
  };

  const toggle = (obid: string) =>
    setCollapsed((prev) => {
      const s = new Set(prev);
      s.has(obid) ? s.delete(obid) : s.add(obid);
      return s;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SubPills<Sub>
          value={sub}
          onChange={setSub}
          options={[
            { value: "all", label: "全部", count: counts.all },
            { value: "not_picked", label: "未揀貨", count: counts.not_picked },
            { value: "picked", label: "已揀貨", count: counts.picked },
          ]}
        />
        <div className="relative">
          <IconSearch
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="搜尋出庫單 / 追蹤號…"
            className="h-8 w-[260px] pl-8 text-xs"
          />
        </div>
      </div>

      {isLoading && allRows.length === 0 ? (
        <StageLoading rows={3} />
      ) : error ? (
        <StageError message={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <StageEmpty
          title="冇等待併箱嘅出庫單"
          description="託管組 sweep 後或手動建出庫單後會出現喺呢度"
        />
      ) : null}
      <div className="space-y-3">
        {rows.map((r) => {
          const isCollapsed = collapsed.has(r.obid);
          return (
            <Card key={r.obid} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(r.obid)}
                className="grid w-full grid-cols-[20px_150px_70px_90px_1fr_100px_120px_60px] items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 text-[13px]"
              >
                <IconChevronDown
                  size={14}
                  className={cn(
                    "transition-transform text-muted-foreground",
                    isCollapsed && "-rotate-90"
                  )}
                />
                <span className="font-mono text-[12.5px] font-semibold tabular-nums">
                  {r.obid}
                </span>
                <span className="text-muted-foreground text-[12px]">
                  {r.total} 件貨
                </span>
                <span className="font-mono text-[12px] tabular-nums">
                  {r.value}
                </span>
                <span className="truncate text-muted-foreground text-[12px]">
                  {r.recipient} · {r.carrier}
                </span>
                <ShipmentStatusBadge variant={r.subVariant}>
                  {r.subLabel}
                </ShipmentStatusBadge>
                <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
                  {r.time}
                </span>
                <span className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetail({
                        trackingNo: r.obid,
                        itemSummary: `${r.total} 件貨 · ${r.children
                          .map((c) => c.items)
                          .join("、")}`,
                        declaredValue: r.value,
                        stageLabel: "等待併箱",
                        subStatusLabel: r.subLabel,
                        subStatusVariant: r.subVariant,
                        recipient: r.recipient,
                        carrier: r.carrier,
                        createdAt: r.time,
                        timeline: buildDetailTimeline(3),
                        canEdit: false,
                        canCancel: false,
                        canViewDispatch: true,
                      });
                    }}
                  >
                    詳情
                  </Button>
                </span>
              </button>
              {!isCollapsed && (
                <div className="border-t border-border bg-muted/20">
                  <ul className="divide-y divide-border">
                    {r.children.map((c) => (
                      <li
                        key={c.id}
                        className="grid grid-cols-[20px_150px_1fr_90px_120px] items-center gap-3 px-4 py-2 text-[12px]"
                      >
                        <span />
                        <span className="font-mono tabular-nums">{c.id}</span>
                        <span>{c.items}</span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {c.price}
                        </span>
                        <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                          {c.time}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

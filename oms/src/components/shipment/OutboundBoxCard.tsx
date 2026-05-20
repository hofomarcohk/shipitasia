"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { OutboundCard } from "@/lib/shipment-mock";
import { IconBox, IconCopy, IconExternalLink } from "@tabler/icons-react";
import { ShipmentStatusBadge } from "./ShipmentStatusBadge";

interface OutboundBoxCardProps {
  data: OutboundCard;
  showTracking?: boolean;
  onShowDetail?: () => void;
}

export function OutboundBoxCard({
  data,
  showTracking,
  onShowDetail,
}: OutboundBoxCardProps) {
  return (
    <Card className="overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-semibold tabular-nums">
            {data.obid}
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">
            {data.recipient} · {data.carrier}
            {data.pickupAt && (
              <>
                {" · 攬收 "}
                <strong className="text-foreground">{data.pickupAt}</strong>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {data.chips.map((c, i) => (
            <ShipmentStatusBadge key={i} variant={c.variant}>
              {c.label}
            </ShipmentStatusBadge>
          ))}
        </div>
      </header>

      <div className="space-y-2 bg-muted/30 p-3">
        {data.boxes.map((b, i) => {
          const tracking = showTracking ? `TR884201652${3 + i}` : null;
          return (
            <div
              key={b.bid}
              className="rounded-md border border-border bg-background"
            >
              <div className="flex items-center gap-3 border-b border-border px-3 py-2">
                <IconBox size={16} className="text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[12px] font-semibold tabular-nums">
                    {b.bid}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {b.dim} · {b.weight} · {b.items.length} 件
                  </div>
                </div>
                {tracking && (
                  <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
                    <span className="font-mono text-[11px] tabular-nums">
                      {tracking}
                    </span>
                    <button
                      type="button"
                      title="複製運單號"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => navigator.clipboard?.writeText(tracking)}
                    >
                      <IconCopy size={11} />
                    </button>
                    <button
                      type="button"
                      title="開 carrier 追蹤頁"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <IconExternalLink size={11} />
                    </button>
                  </div>
                )}
              </div>
              <ul className="divide-y divide-border">
                {b.items.map((it) => (
                  <li
                    key={it.id}
                    className="grid grid-cols-[140px_1fr_auto] gap-3 px-3 py-1.5 text-[12px]"
                  >
                    <span className="font-mono tabular-nums">{it.id}</span>
                    <span>{it.items}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {it.price}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <footer className="flex items-center justify-between border-t border-border px-5 py-2.5 text-[12px]">
        <span className="text-muted-foreground">
          合計 <strong className="text-foreground">{data.totalWeight}</strong> ·{" "}
          {data.boxCount} 箱
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onShowDetail}
        >
          查看出庫單詳情
        </Button>
      </footer>
    </Card>
  );
}

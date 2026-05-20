"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  IconPackageExport,
  IconPrinter,
  IconUserEdit,
} from "@tabler/icons-react";
import { ShipmentStatusBadge, type ShipmentChipVariant } from "./ShipmentStatusBadge";
import { ShipmentTimeline, type TimelineRow } from "./ShipmentTimeline";

export interface ShipmentDetail {
  trackingNo: string;
  itemSummary: string;
  declaredValue?: string;
  deliveryMethod?: string;
  stageLabel: string;
  subStatusLabel?: string;
  subStatusVariant: ShipmentChipVariant;
  recipient: string;
  carrier: string;
  inboundCarrier?: string;
  createdAt: string;
  timeline: TimelineRow[];
  canEdit?: boolean;
  canCancel?: boolean;
  canViewDispatch?: boolean;
}

interface ShipmentDetailSheetProps {
  shipment: ShipmentDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShipmentDetailSheet({
  shipment,
  open,
  onOpenChange,
}: ShipmentDetailSheetProps) {
  if (!shipment) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[520px] flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="font-mono text-base tracking-tight">
                {shipment.trackingNo}
              </SheetTitle>
              <div className="mt-1 text-xs text-muted-foreground">
                {shipment.itemSummary}
                {shipment.declaredValue && ` · ${shipment.declaredValue}`}
                {shipment.deliveryMethod && ` · ${shipment.deliveryMethod}`}
              </div>
            </div>
            <ShipmentStatusBadge variant={shipment.subStatusVariant}>
              {shipment.stageLabel}
              {shipment.subStatusLabel &&
                shipment.subStatusLabel !== "無子狀態" &&
                ` · ${shipment.subStatusLabel}`}
            </ShipmentStatusBadge>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <section>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              基本資料
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <div className="text-[11px] text-muted-foreground">收件人</div>
                <div className="mt-0.5">{shipment.recipient}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Carrier</div>
                <div className="mt-0.5">{shipment.carrier}</div>
              </div>
              {shipment.inboundCarrier && (
                <div>
                  <div className="text-[11px] text-muted-foreground">
                    入庫快遞
                  </div>
                  <div className="mt-0.5">{shipment.inboundCarrier}</div>
                </div>
              )}
              <div>
                <div className="text-[11px] text-muted-foreground">建立時間</div>
                <div className="mt-0.5 font-mono text-[12px] tabular-nums">
                  {shipment.createdAt}
                </div>
              </div>
            </div>
          </section>

          <Separator />

          <section>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              貨件流轉
            </h3>
            <ShipmentTimeline rows={shipment.timeline} />
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <Button variant="ghost" size="sm" disabled={!shipment.canEdit}>
            <IconUserEdit size={14} className="mr-1.5" />
            編輯收件人
          </Button>
          <Button variant="outline" size="sm" disabled={!shipment.canEdit}>
            <IconPrinter size={14} className="mr-1.5" />
            列印標籤
          </Button>
          <Button size="sm" disabled={!shipment.canViewDispatch}>
            <IconPackageExport size={14} className="mr-1.5" />
            查看出庫單
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useShipmentOverview } from "@/hooks/use-shipment-overview";
import { buildDetailTimeline } from "@/lib/shipment-mock";
import { IconDownload, IconExternalLink, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useOpenShipmentDetail } from "../ShipmentDetailProvider";
import { StageEmpty, StageError, StageLoading } from "../StageStates";
import { SubPills } from "../SubPills";

interface DispatchedRow {
  obid: string;
  cb: string;
  value: string;
  recipient: string;
  carrier: string;
  time: string;
}

type DispatchedSub = "30d" | "month" | "lastmth" | "custom";

export function StageDispatchedView() {
  const [sub, setSub] = useState<DispatchedSub>("30d");
  const [search, setSearch] = useState("");
  const openDetail = useOpenShipmentDetail();
  const { data, isLoading, error, refetch } =
    useShipmentOverview<{ rows: DispatchedRow[] }>("dispatched");

  const rows = data?.rows ?? [];
  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.obid.toLowerCase().includes(q) ||
      r.recipient.toLowerCase().includes(q) ||
      r.carrier.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SubPills<DispatchedSub>
          value={sub}
          onChange={setSub}
          options={[
            // MEDIUM-005 fix — backend currently returns last-30-days only;
            // expose row count for that bucket and hide the rest until
            // server-side range filter lands.
            { value: "30d",     label: "近 30 天", count: rows.length },
            { value: "month",   label: "本月" },
            { value: "lastmth", label: "上月" },
            { value: "custom",  label: "自選日期" },
          ]}
        />
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm">
            <IconDownload size={14} className="mr-1.5" />
            匯出 CSV
          </Button>
        </div>
      </div>

      {isLoading && rows.length === 0 ? (
        <StageLoading rows={5} />
      ) : error ? (
        <StageError message={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <StageEmpty
          title="近 30 天未有出倉紀錄"
          description="出倉嘅貨件會喺呢度顯示完成清單"
        />
      ) : (
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[150px] text-xs">出庫單號</TableHead>
              <TableHead className="w-[100px] text-xs">件 / 箱</TableHead>
              <TableHead className="w-[110px] text-xs">總申報值</TableHead>
              <TableHead className="text-xs">收件人</TableHead>
              <TableHead className="w-[140px] text-xs">Carrier</TableHead>
              <TableHead className="w-[120px] text-xs">出倉時間</TableHead>
              <TableHead className="w-[60px] text-xs">追蹤</TableHead>
              <TableHead className="w-[70px] text-right text-xs">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  無符合條件嘅出庫單
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.obid} className="hover:bg-muted/30">
                <TableCell className="font-mono text-[12.5px] tabular-nums">
                  {r.obid}
                </TableCell>
                <TableCell className="text-sm">{r.cb}</TableCell>
                <TableCell className="font-mono text-[12.5px] tabular-nums">
                  {r.value}
                </TableCell>
                <TableCell className="text-sm">{r.recipient}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.carrier}
                </TableCell>
                <TableCell className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
                  {r.time}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                    title="開 carrier 追蹤頁"
                  >
                    <IconExternalLink size={12} />
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      openDetail({
                        trackingNo: r.obid,
                        itemSummary: r.cb,
                        declaredValue: r.value,
                        stageLabel: "已出倉",
                        subStatusLabel: "已完成",
                        subStatusVariant: "ok",
                        recipient: r.recipient,
                        carrier: r.carrier,
                        createdAt: r.time,
                        timeline: buildDetailTimeline(6),
                        canEdit: false,
                        canCancel: false,
                        canViewDispatch: true,
                      })
                    }
                  >
                    詳情
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}
    </div>
  );
}

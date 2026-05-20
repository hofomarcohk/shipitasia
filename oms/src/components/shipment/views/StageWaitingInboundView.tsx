"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useShipmentOverview } from "@/hooks/use-shipment-overview";
import {
  METHOD_LABEL,
  type DeliveryMethod,
  type WaitingInboundRow,
} from "@/lib/shipment-mock";
import { cn } from "@/lib/utils";
import {
  IconCalendar,
  IconDotsVertical,
  IconSearch,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog";
import { MethodChip } from "../MethodChip";
import { ShipmentStatusBadge } from "../ShipmentStatusBadge";
import { useOpenShipmentDetail } from "../ShipmentDetailProvider";
import { StageEmpty, StageError, StageLoading } from "../StageStates";
import { SubPills } from "../SubPills";
import { useShipmentMutation } from "../use-shipment-mutation";
import { buildDetailTimeline } from "@/lib/shipment-mock";

type Sub = "all" | "not_arrived" | "arrived";

type ConfirmState =
  | { type: "change_method"; rowId: string; current: DeliveryMethod }
  | { type: "cancel"; rowId: string }
  | null;

/**
 * Radix has a known race when a DropdownMenu item directly opens an
 * AlertDialog/Dialog/Sheet: the dropdown's pointer-events cleanup runs
 * concurrently with the dialog's own body lock, leaving the page frozen
 * after the dialog closes. Deferring the state change one macrotask lets
 * the menu finish closing first.
 *   https://github.com/radix-ui/primitives/issues/2122
 */
const deferOpen = (fn: () => void) => setTimeout(fn, 0);

export function StageWaitingInboundView() {
  const [sub, setSub] = useState<Sub>("all");
  // HIGH-003 fix — start with empty selection. Previously had a hardcoded
  // mock inbound id from the pre-API mock era which leaked as a ghost bulk-bar
  // entry on first render.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [pendingMethod, setPendingMethod] =
    useState<DeliveryMethod>("managed");
  const [search, setSearch] = useState("");
  const openDetail = useOpenShipmentDetail();
  const mutate = useShipmentMutation();
  const { data, isLoading, error, refetch } =
    useShipmentOverview<{ rows: WaitingInboundRow[] }>("waiting_inbound");

  const allRows = data?.rows ?? [];

  // CRITICAL-001 fix — UI enum ("managed"/"direct"/"manual") differs from
  // backend ShippingMode enum. Map before sending.
  const UI_TO_BACKEND_METHOD: Record<DeliveryMethod, string> = {
    managed: "managed_consign",
    direct: "single_direct",
    manual: "manual_consolidate",
  };

  const runChangeMethod = async () => {
    if (confirm?.type !== "change_method") return;
    const result = await mutate(
      `/api/cms/inbound/${confirm.rowId}/change-method`,
      { to_method: UI_TO_BACKEND_METHOD[pendingMethod] },
      { successTitle: "寄送方式已更新" }
    );
    setConfirm(null);
    if (result.ok) refetch();
  };

  const runCancel = async () => {
    if (confirm?.type !== "cancel") return;
    const result = await mutate(
      `/api/cms/inbound/${confirm.rowId}/cancel`,
      {},
      { successTitle: "預報已取消" }
    );
    setConfirm(null);
    if (result.ok) refetch();
  };

  const showDetail = (r: WaitingInboundRow) => {
    const notArrived = r.sub === "not_arrived";
    openDetail({
      trackingNo: r.id,
      itemSummary: r.items,
      deliveryMethod: METHOD_LABEL[r.method],
      stageLabel: "等待入庫",
      subStatusLabel: notArrived ? "未到倉" : "已到倉",
      subStatusVariant: notArrived ? "idle" : "info",
      recipient: r.recipient,
      carrier: r.carrier,
      inboundCarrier: r.carrier,
      createdAt: r.time,
      timeline: buildDetailTimeline(notArrived ? 0 : 1),
      canEdit: notArrived,
      canCancel: notArrived,
      canViewDispatch: false,
    });
  };

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (sub !== "all" && r.sub !== sub) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          r.id.toLowerCase().includes(q) ||
          r.items.toLowerCase().includes(q) ||
          r.recipient.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allRows, sub, search]);

  const counts = {
    all: allRows.length,
    not_arrived: allRows.filter((r) => r.sub === "not_arrived").length,
    arrived: allRows.filter((r) => r.sub === "arrived").length,
  };

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const handleChangeMethod = (row: WaitingInboundRow) => {
    setPendingMethod(row.method);
    setConfirm({ type: "change_method", rowId: row.id, current: row.method });
  };

  const sideEffect = (() => {
    if (pendingMethod === "managed")
      return "改為託管寄送會 detach 現有 consolidation_group 並重新配對。";
    if (pendingMethod === "manual")
      return "改為手動併貨後，貨上架後需要你自行揀件建單。";
    return "改為單一直送後，到貨即時 1:1 出庫，不與其他包裹合併。";
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SubPills<Sub>
          value={sub}
          onChange={setSub}
          options={[
            { value: "all", label: "全部", count: counts.all },
            { value: "not_arrived", label: "未到倉", count: counts.not_arrived },
            { value: "arrived", label: "已到倉", count: counts.arrived },
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
              placeholder="搜尋追蹤號 / 品項 / 收件人…"
              className="h-8 w-[260px] pl-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm">
            <IconCalendar size={14} className="mr-1.5" />
            時間範圍
          </Button>
        </div>
      </div>

      {isLoading && allRows.length === 0 ? (
        <StageLoading rows={5} />
      ) : error ? (
        <StageError message={error} onRetry={refetch} />
      ) : allRows.length === 0 ? (
        <StageEmpty
          title="未有等待入庫嘅貨件"
          description="新增預報後會喺呢度顯示，等待倉庫掃碼到貨"
        />
      ) : (
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[40px]" />
              <TableHead className="w-[140px] text-xs">追蹤號</TableHead>
              <TableHead className="text-xs">品項</TableHead>
              <TableHead className="w-[80px] text-xs">子狀態</TableHead>
              <TableHead className="w-[110px] text-xs">寄送方式</TableHead>
              <TableHead className="w-[150px] text-xs">收件人</TableHead>
              <TableHead className="w-[130px] text-xs">Carrier</TableHead>
              <TableHead className="w-[110px] text-xs">預報時間</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const locked = r.sub === "arrived";
              return (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggleSel(r.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-[12.5px] tabular-nums">
                    {r.id}
                  </TableCell>
                  <TableCell className="text-sm">{r.items}</TableCell>
                  <TableCell>
                    <ShipmentStatusBadge variant={locked ? "info" : "idle"}>
                      {locked ? "已到倉" : "未到倉"}
                    </ShipmentStatusBadge>
                  </TableCell>
                  <TableCell>
                    <MethodChip
                      method={r.method}
                      locked={locked}
                      onClick={() => handleChangeMethod(r)}
                    />
                  </TableCell>
                  <TableCell className="text-sm">{r.recipient}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.carrier}
                  </TableCell>
                  <TableCell className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
                    {r.time}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="操作"
                        >
                          <IconDotsVertical size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {locked ? (
                          <DropdownMenuItem
                            onClick={() => deferOpen(() => showDetail(r))}
                          >
                            查看詳情
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem
                              onClick={() => deferOpen(() => showDetail(r))}
                            >
                              編輯預報
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                deferOpen(() => {
                                  setPendingMethod("managed");
                                  setConfirm({
                                    type: "change_method",
                                    rowId: r.id,
                                    current: r.method,
                                  });
                                })
                              }
                            >
                              改為託管寄送
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                deferOpen(() => {
                                  setPendingMethod("direct");
                                  setConfirm({
                                    type: "change_method",
                                    rowId: r.id,
                                    current: r.method,
                                  });
                                })
                              }
                            >
                              改為單一直送
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                deferOpen(() => {
                                  setPendingMethod("manual");
                                  setConfirm({
                                    type: "change_method",
                                    rowId: r.id,
                                    current: r.method,
                                  });
                                })
                              }
                            >
                              改為手動併貨
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() =>
                                deferOpen(() =>
                                  setConfirm({ type: "cancel", rowId: r.id })
                                )
                              }
                            >
                              取消預報
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  無符合條件嘅貨件
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-lg bg-foreground px-4 py-2.5 text-background shadow-lg">
          <div className="text-[13px]">
            已選 <span className="font-mono font-semibold">{selected.size}</span> 件
            <span className="ml-3 text-background/60">· 全部未到倉</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-background/85 hover:bg-background/10 hover:text-background"
              onClick={() => setSelected(new Set())}
            >
              取消選取
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 bg-transparent text-xs text-background border-background/30 hover:bg-background/10 hover:text-background"
            >
              批量改寄送方式 ▾
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 bg-transparent text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
            >
              批量取消預報
            </Button>
          </div>
        </div>
      )}

      <div className="text-[12px] text-muted-foreground">
        頁 1 / 1 · 已顯示 {rows.length} 件
      </div>

      {/* Change-method confirm */}
      <ConfirmDialog
        open={confirm?.type === "change_method"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="改寄送方式？"
        // onConfirm wired below
        description={
          confirm?.type === "change_method" && (
            <>
              <div>
                <strong className="text-foreground font-mono">
                  {confirm.rowId}
                </strong>{" "}
                由「{METHOD_LABEL[confirm.current]}」改為：
              </div>
              <RadioGroup
                value={pendingMethod}
                onValueChange={(v) => setPendingMethod(v as DeliveryMethod)}
                className="mt-2 space-y-1.5"
              >
                {(["managed", "direct", "manual"] as DeliveryMethod[]).map(
                  (m) => (
                    <Label
                      key={m}
                      htmlFor={`m-${m}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[13px]",
                        pendingMethod === m && "border-foreground bg-muted/40"
                      )}
                    >
                      <RadioGroupItem value={m} id={`m-${m}`} />
                      {METHOD_LABEL[m]}
                      {m === "managed" && (
                        <span className="text-[11px] text-muted-foreground">
                          （需揀已儲存地址 + carrier）
                        </span>
                      )}
                    </Label>
                  )
                )}
              </RadioGroup>
              <div className="text-[11.5px] text-muted-foreground">
                {sideEffect}
              </div>
            </>
          )
        }
        onConfirm={runChangeMethod}
      />

      {/* Cancel confirm */}
      <ConfirmDialog
        open={confirm?.type === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="確定要取消預報？"
        destructive
        confirmLabel="確定取消"
        cancelLabel="不取消"
        description={
          confirm?.type === "cancel" && (
            <div>
              <strong className="text-foreground font-mono">
                {confirm.rowId}
              </strong>{" "}
              取消後，貨到日本倉時將被列入
              <strong className="text-foreground">無頭件</strong>，
              需要由客服協助處理。
            </div>
          )
        }
        onConfirm={runCancel}
      />
    </div>
  );
}

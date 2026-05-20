"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type ConsolidationGroup } from "@/lib/shipment-mock";
import { useShipmentOverview } from "@/hooks/use-shipment-overview";

interface ManualPendingRow {
  id: string;
  items: string;
  price: string;
  recipient: string;
  time: string;
}
import { cn } from "@/lib/utils";
import {
  IconClock,
  IconDotsVertical,
  IconSearch,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog";
import { useOpenShipmentDetail } from "../ShipmentDetailProvider";
import { ShipmentStatusBadge } from "../ShipmentStatusBadge";
import { StageEmpty, StageError, StageLoading } from "../StageStates";
import { SubPills } from "../SubPills";
import {
  buildDetailTimeline,
  computeSla,
  type ConsolidationGroupItem,
} from "@/lib/shipment-mock";
import { useShipmentMutation } from "../use-shipment-mutation";

type Sub = "all" | "managed" | "manual";

/**
 * Radix DropdownMenu → AlertDialog/Sheet race fix.
 * https://github.com/radix-ui/primitives/issues/2122
 * Defer state change one macrotask so the menu finishes closing first.
 */
const deferOpen = (fn: () => void) => setTimeout(fn, 0);

type ConfirmState =
  | { type: "release_all"; gid: string }
  | { type: "release_partial"; gid: string; count: number }
  | { type: "release_subset"; gid: string; ids: string[] }
  | { type: "detach_subset"; gid: string; ids: string[] }
  | { type: "row_release"; gid: string; id: string }
  | { type: "row_detach"; gid: string; id: string }
  | { type: "create_outbound"; ids: string[] }
  | null;

export function StageShelvedView() {
  const [sub, setSub] = useState<Sub>("managed");
  // HIGH-003 fix — start with empty selections. Previously had hardcoded
  // mock keys from the pre-API mock era which leaked as ghost bulk-bar
  // entries on first render.
  const [selectedInGroup, setSelectedInGroup] = useState<Set<string>>(
    new Set()
  );
  const [manualSel, setManualSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [search, setSearch] = useState("");
  const openDetail = useOpenShipmentDetail();
  const mutate = useShipmentMutation();
  const { data, isLoading, error, refetch } = useShipmentOverview<{
    managed: ConsolidationGroup[];
    manualPending: ManualPendingRow[];
  }>("shelved");

  const allGroups: ConsolidationGroup[] = data?.managed ?? [];
  const allManualPending: ManualPendingRow[] = data?.manualPending ?? [];

  // MEDIUM-004 fix — wire Stage 2 search input.
  const q = search.trim().toLowerCase();
  const groups = !q
    ? allGroups
    : allGroups.filter(
        (g) =>
          g.gid.toLowerCase().includes(q) ||
          g.recipient.toLowerCase().includes(q) ||
          g.carrier.toLowerCase().includes(q) ||
          g.items.some(
            (it) =>
              it.id.toLowerCase().includes(q) ||
              it.items.toLowerCase().includes(q)
          )
      );
  const manualPending = !q
    ? allManualPending
    : allManualPending.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.items.toLowerCase().includes(q) ||
          r.recipient.toLowerCase().includes(q)
      );

  const shelvedIdsInGroup = (gid: string): string[] => {
    const g = groups.find((x) => x.gid === gid);
    if (!g) return [];
    return g.items.filter((it) => !it.notArrived).map((it) => it.id);
  };

  const runConfirm = async () => {
    if (!confirm) return;
    let ok = false;
    switch (confirm.type) {
      case "release_all":
        ok = (await mutate(
          `/api/cms/consolidation-groups/${confirm.gid}/force-release`,
          {},
          { successTitle: "整組已立即排出庫" }
        )).ok;
        break;
      case "release_partial":
        ok = (await mutate(
          `/api/cms/consolidation-groups/${confirm.gid}/force-release`,
          { inbound_ids: shelvedIdsInGroup(confirm.gid) },
          {
            successTitle: `已立即排出 ${confirm.count} 件`,
            successDescription: "未到倉嘅件自動 detach 成新 pending group",
          }
        )).ok;
        break;
      case "release_subset":
        ok = (await mutate(
          `/api/cms/consolidation-groups/${confirm.gid}/force-release`,
          { inbound_ids: confirm.ids },
          { successTitle: "選中件已立即排出庫" }
        )).ok;
        break;
      case "row_release":
        ok = (await mutate(
          `/api/cms/consolidation-groups/${confirm.gid}/force-release`,
          { inbound_ids: [confirm.id] },
          { successTitle: "此件已立即排出庫" }
        )).ok;
        break;
      case "row_detach":
        ok = (await mutate(
          `/api/cms/inbound/${confirm.id}/detach-to-manual`,
          {},
          { successTitle: "已改為手動併貨" }
        )).ok;
        break;
      case "detach_subset":
        const results = await Promise.allSettled(
          confirm.ids.map((id) =>
            mutate(`/api/cms/inbound/${id}/detach-to-manual`, {})
          )
        );
        ok = results.some(
          (r) => r.status === "fulfilled" && r.value.ok
        );
        break;
      case "create_outbound":
        ok = (await mutate("/api/cms/outbound/manual-from-inbound", {
          inbound_ids: confirm.ids,
        }, { successTitle: "出庫單已建立" })).ok;
        if (ok) setManualSel(new Set());
        break;
    }
    setConfirm(null);
    if (ok) refetch();
  };

  const toggleGroupSel = (key: string) =>
    setSelectedInGroup((prev) => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });
  const toggleManualSel = (id: string) =>
    setManualSel((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const manualTotal = useMemo(
    () =>
      manualPending
        .filter((r) => manualSel.has(r.id))
        .reduce((sum, r) => {
          const n = parseInt(r.price.replace(/\D/g, ""), 10) || 0;
          return sum + n;
        }, 0),
    [manualSel, manualPending]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SubPills<Sub>
          value={sub}
          onChange={setSub}
          options={[
            {
              value: "all",
              label: "全部",
              count: allGroups.length + allManualPending.length,
            },
            { value: "managed", label: "託管中", count: allGroups.length },
            {
              value: "manual",
              label: "待手動建單",
              count: allManualPending.length,
            },
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
            placeholder="搜尋組 / 追蹤號 / 收件人…"
            className="h-8 w-[260px] pl-8 text-xs"
          />
        </div>
      </div>

      {isLoading && groups.length === 0 && manualPending.length === 0 ? (
        <StageLoading rows={3} />
      ) : error ? (
        <StageError message={error} onRetry={refetch} />
      ) : groups.length === 0 && manualPending.length === 0 ? (
        <StageEmpty
          title="未有已上架嘅貨件"
          description="貨件入倉後會自動上架，等待併箱組或手動建單"
        />
      ) : null}

      {(sub === "all" || sub === "managed") &&
        groups.map((g) => (
          <GroupCard
            key={g.gid}
            data={g}
            selected={selectedInGroup}
            toggleSel={toggleGroupSel}
            onReleaseAll={() => setConfirm({ type: "release_all", gid: g.gid })}
            onReleasePartial={(count) =>
              setConfirm({ type: "release_partial", gid: g.gid, count })
            }
            onReleaseSubset={(ids) =>
              setConfirm({ type: "release_subset", gid: g.gid, ids })
            }
            onDetachSubset={(ids) =>
              setConfirm({ type: "detach_subset", gid: g.gid, ids })
            }
            onRowRelease={(id) =>
              setConfirm({ type: "row_release", gid: g.gid, id })
            }
            onRowDetach={(id) =>
              setConfirm({ type: "row_detach", gid: g.gid, id })
            }
            onShowItemDetail={(it) => {
              openDetail({
                trackingNo: it.id,
                itemSummary: it.items,
                declaredValue: it.price,
                stageLabel: "已上架",
                subStatusLabel: it.notArrived ? "未到倉" : "已上架",
                subStatusVariant: it.notArrived ? "idle" : "ok",
                recipient: g.recipient,
                carrier: g.carrier,
                createdAt: it.time ?? "—",
                timeline: buildDetailTimeline(it.notArrived ? 0 : 2),
                canEdit: false,
                canCancel: false,
                canViewDispatch: false,
              });
            }}
            onShowGroupDetail={() => {
              const gSla = computeSla(g.sweepDueYmd);
              openDetail({
                trackingNo: g.gid,
                itemSummary: `${g.shelved}/${g.total} 已上架 · 託管併箱組`,
                declaredValue: g.items
                  .map((it) => parseInt(it.price.replace(/\D/g, ""), 10) || 0)
                  .reduce((a, b) => a + b, 0)
                  .toLocaleString("en-US", { style: "currency", currency: "JPY" }),
                stageLabel: "已上架",
                subStatusVariant:
                  gSla.variant === "urgent"
                    ? "warn"
                    : gSla.variant === "idle"
                    ? "idle"
                    : "info",
                subStatusLabel: gSla.text,
                recipient: g.recipient,
                carrier: g.carrier,
                createdAt: g.oldestYmd ?? "—",
                timeline: buildDetailTimeline(2),
                canEdit: false,
                canCancel: false,
                canViewDispatch: false,
              });
            }}
          />
        ))}

      {(sub === "all" || sub === "manual") && manualPending.length > 0 && (
        <section
          className={cn(
            sub === "all" && "mt-6 border-t border-dashed border-border pt-5"
          )}
        >
          <div className="flex items-end justify-between mb-3">
            <div>
              <h3 className="text-[14.5px] font-semibold">
                待手動建單{" "}
                <span className="font-normal text-muted-foreground">
                  · {manualPending.length} 件
                </span>
              </h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                這些貨件上架後未加入託管組，需要你揀件建出庫單。
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setManualSel(new Set(manualPending.map((r) => r.id)))
              }
            >
              全選
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-background overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[40px]" />
                  <TableHead className="w-[140px] text-xs">追蹤號</TableHead>
                  <TableHead className="text-xs">品項</TableHead>
                  <TableHead className="w-[100px] text-xs">申報值</TableHead>
                  <TableHead className="w-[160px] text-xs">預定收件人</TableHead>
                  <TableHead className="w-[120px] text-xs">上架時間</TableHead>
                  <TableHead className="w-[70px] text-right text-xs">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manualPending.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell>
                      <Checkbox
                        checked={manualSel.has(r.id)}
                        onCheckedChange={() => toggleManualSel(r.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-[12.5px] tabular-nums">
                      {r.id}
                    </TableCell>
                    <TableCell className="text-sm">{r.items}</TableCell>
                    <TableCell className="font-mono text-[12.5px] tabular-nums">
                      {r.price}
                    </TableCell>
                    <TableCell className="text-sm">{r.recipient}</TableCell>
                    <TableCell className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
                      {r.time}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                      >
                        詳情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {manualSel.size > 0 && (
            <div className="sticky bottom-4 z-10 mt-3 flex items-center justify-between rounded-lg bg-foreground px-4 py-2.5 text-background shadow-lg">
              <div className="text-[13px]">
                已選{" "}
                <span className="font-mono font-semibold">
                  {manualSel.size}
                </span>{" "}
                件
                <span className="ml-3 text-background/60">
                  · 合計 ¥{manualTotal.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-background/85 hover:bg-background/10 hover:text-background"
                  onClick={() => setManualSel(new Set())}
                >
                  取消選取
                </Button>
                <Button
                  size="sm"
                  className="h-7 bg-background text-foreground hover:bg-background/90"
                  onClick={() =>
                    setConfirm({
                      type: "create_outbound",
                      ids: Array.from(manualSel),
                    })
                  }
                >
                  建立出庫單 →
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Confirmations */}
      <ConfirmDialog
        open={confirm?.type === "release_all"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="整組立即出貨？"
        description={
          confirm?.type === "release_all" && (
            <div>
              <strong className="text-foreground font-mono">
                {confirm.gid}
              </strong>{" "}
              所有已上架貨件將立即生成出庫單並進入「等待併箱」。SLA 自動取消。
            </div>
          )
        }
        onConfirm={runConfirm}
      />
      <ConfirmDialog
        open={confirm?.type === "release_partial"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="不等了 · 現有件數立即出貨？"
        description={
          confirm?.type === "release_partial" && (
            <div>
              將出 {confirm.count} 件；其餘未到倉嘅件會自動 detach 成新嘅 pending
              group，到貨後重新配對。
            </div>
          )
        }
        onConfirm={runConfirm}
      />
      <ConfirmDialog
        open={confirm?.type === "release_subset"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="選中立即出貨？"
        description={
          confirm?.type === "release_subset" && (
            <div>
              將將 {confirm.ids.length} 件 detach 出單獨出庫；其餘留喺原 group。
            </div>
          )
        }
        onConfirm={runConfirm}
      />
      <ConfirmDialog
        open={confirm?.type === "detach_subset"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="解除自動（所選）？"
        description={
          confirm?.type === "detach_subset" && (
            <div>
              所選 {confirm.ids.length} 件會由 group 移除，改為「待手動建單」，
              需要你揀件建單。
            </div>
          )
        }
        onConfirm={runConfirm}
      />
      <ConfirmDialog
        open={confirm?.type === "row_release"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="立即出貨此件？"
        description={
          confirm?.type === "row_release" && (
            <div>
              <strong className="text-foreground font-mono">
                {confirm.id}
              </strong>{" "}
              將 detach 出單獨出庫；其餘留喺原 group。
            </div>
          )
        }
        onConfirm={runConfirm}
      />
      <ConfirmDialog
        open={confirm?.type === "row_detach"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="解除自動，改為手動？"
        description={
          confirm?.type === "row_detach" && (
            <div>
              <strong className="text-foreground font-mono">
                {confirm.id}
              </strong>{" "}
              由 group 移除並改為手動併貨。已上架嘅貨會立即出現喺「待手動建單」。
            </div>
          )
        }
        onConfirm={runConfirm}
      />
      <ConfirmDialog
        open={confirm?.type === "create_outbound"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="建立出庫單？"
        description={
          confirm?.type === "create_outbound" && (
            <div>
              所選 {confirm.ids.length} 件會生成一張新出庫單並進入「等待併箱」階段。
            </div>
          )
        }
        onConfirm={runConfirm}
      />
    </div>
  );
}

/* ============================================================
 * GroupCard (local)
 * ==========================================================*/
function GroupCard({
  data,
  selected,
  toggleSel,
  onReleaseAll,
  onReleasePartial,
  onReleaseSubset,
  onDetachSubset,
  onRowRelease,
  onRowDetach,
  onShowItemDetail,
  onShowGroupDetail,
}: {
  data: ConsolidationGroup;
  selected: Set<string>;
  toggleSel: (key: string) => void;
  onReleaseAll: () => void;
  onReleasePartial: (count: number) => void;
  onReleaseSubset: (ids: string[]) => void;
  onDetachSubset: (ids: string[]) => void;
  onRowRelease: (id: string) => void;
  onRowDetach: (id: string) => void;
  onShowItemDetail: (it: ConsolidationGroupItem) => void;
  onShowGroupDetail: () => void;
}) {
  const isFullShelved = data.shelved === data.total;
  const notArrived = data.total - data.shelved;
  const progressPct = (data.shelved / data.total) * 100;
  const sla = computeSla(data.sweepDueYmd);

  const slaClass =
    sla.variant === "urgent"
      ? "bg-[hsl(var(--chip-warn-bg))] text-[hsl(var(--chip-warn-fg))]"
      : sla.variant === "idle"
      ? "bg-muted text-muted-foreground"
      : "bg-[hsl(var(--brand-soft))] text-[hsl(var(--brand-strong))]";

  const selectedInThisGroup = Array.from(selected).filter((k) =>
    k.startsWith(data.gid + "/")
  );

  return (
    <Card className="overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="font-mono text-[12.5px] font-semibold tabular-nums">
            {data.gid} · 託管併箱組
          </div>
          <div className="mt-0.5 text-[13px] font-medium">
            {data.recipient} · {data.carrier}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="relative inline-block h-1.5 w-[80px] overflow-hidden rounded-full bg-muted">
                <span
                  className="absolute inset-y-0 left-0 bg-foreground"
                  style={{ width: `${progressPct}%` }}
                />
              </span>
              <strong className="text-foreground tabular-nums">
                {data.shelved}/{data.total}
              </strong>{" "}
              已上架
              {notArrived > 0 && <span>· {notArrived} 件未到倉</span>}
            </span>
            {data.oldestYmd && (
              <span>
                最早到貨 <strong className="text-foreground">{data.oldestYmd}</strong>
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                slaClass
              )}
            >
              <IconClock size={10} />
              {sla.text}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onShowGroupDetail}
          >
            查看詳情
          </Button>
          {isFullShelved ? (
            <Button size="sm" className="h-7 text-xs" onClick={onReleaseAll}>
              整組立即出貨
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              title={`未到倉那 ${notArrived} 件會自動 detach 成新 pending group`}
              onClick={() => onReleasePartial(data.shelved)}
            >
              不等了 · 現有 {data.shelved} 件出貨
            </Button>
          )}
        </div>
      </header>

      <div>
        <div className="grid grid-cols-[32px_140px_1fr_90px_60px_120px_40px] gap-2 bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
          <span />
          <span>追蹤號</span>
          <span>品項</span>
          <span>申報值</span>
          <span>體積</span>
          <span>上架時間</span>
          <span />
        </div>
        {data.items.map((it) => {
          const key = `${data.gid}/${it.id}`;
          const dim = !!it.notArrived;
          return (
            <div
              key={key}
              className={cn(
                "grid grid-cols-[32px_140px_1fr_90px_60px_120px_40px] gap-2 items-center border-t border-border px-3 py-2 text-[12.5px]",
                dim && "opacity-55"
              )}
            >
              <span>
                {!dim && (
                  <Checkbox
                    checked={selected.has(key)}
                    onCheckedChange={() => toggleSel(key)}
                  />
                )}
              </span>
              <span className="font-mono tabular-nums">{it.id}</span>
              <span>{it.items}</span>
              <span className="font-mono tabular-nums">{it.price}</span>
              <span>
                {it.vol ? (
                  it.vol
                ) : dim ? (
                  <ShipmentStatusBadge variant="idle">未到倉</ShipmentStatusBadge>
                ) : (
                  "中"
                )}
              </span>
              <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                {it.time || "—"}
              </span>
              <span className="text-right">
                {!dim && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label="操作"
                      >
                        <IconDotsVertical size={13} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => deferOpen(() => onRowRelease(it.id))}
                      >
                        立即出貨此件
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deferOpen(() => onRowDetach(it.id))}
                      >
                        解除自動，改為手動
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => deferOpen(() => onShowItemDetail(it))}
                      >
                        查看詳情
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {selectedInThisGroup.length > 0 && (
        <footer className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5 text-[12.5px]">
          <span>
            已選{" "}
            <strong className="font-mono">{selectedInThisGroup.length}</strong> 件
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                onDetachSubset(
                  selectedInThisGroup.map((k) => k.split("/")[1])
                )
              }
            >
              解除自動（所選）
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                onReleaseSubset(
                  selectedInThisGroup.map((k) => k.split("/")[1])
                )
              }
            >
              選中立即出貨 →
            </Button>
          </div>
        </footer>
      )}
    </Card>
  );
}

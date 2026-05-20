"use client";

import PageLayout from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { get_request, post_request } from "@/lib/httpRequest";
import {
  IconChevronRight,
  IconRefresh,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

interface ClientInfo {
  _id: string;
  code: string;
  email: string;
  company_name: string;
}
interface InboundRow {
  _id: string;
  status: string;
  shipping_mode: string;
  tracking_no: string;
  consolidation_group_id: string | null;
  receivedAt: string | null;
  createdAt: string;
}
interface GroupRow {
  _id: string;
  status: string;
  forecast_count: number;
  oldest_received_at: string | null;
}
interface OutboundRow {
  _id: string;
  status: string;
  inbound_count: number;
  carrier_code: string;
  shipment_type: string;
  actual_weight_kg: number | null;
  tracking_no: string | null;
  departed_at: string | null;
  createdAt: string;
}

const DEFAULT_CLIENT_ID = "6a030758c8f9a825c3659800"; // SIA0004 wms-test-a

export default function WmsFastForwardPage() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState(DEFAULT_CLIENT_ID);
  const [pendingId, setPendingId] = useState(""); // currently-advancing row id
  const [data, setData] = useState<{
    client: ClientInfo | null;
    inbounds: InboundRow[];
    groups: GroupRow[];
    outbounds: OutboundRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    if (!clientId) return;
    setError(null);
    try {
      const r = await get_request(`/api/wms/admin/fast-forward/state`, {
        client_id: clientId,
      });
      const j = await r.json();
      if (j.status === 200) setData(j.data);
      else setError(j.message ?? `HTTP ${j.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clientId]);

  useEffect(() => {
    void fetcher();
    const iv = setInterval(() => void fetcher(), 15_000);
    return () => clearInterval(iv);
  }, [fetcher]);

  const advance = async (
    resource: "inbound" | "outbound" | "group",
    id: string
  ) => {
    setPendingId(id);
    try {
      const r = await post_request(`/api/wms/admin/fast-forward`, {
        resource,
        id,
      });
      const j = await r.json();
      if (j.status === 200) {
        toast({
          title: "已推進",
          description: `${id} → ${j.data?.nextStatus ?? "next"}${
            j.data?.auto_created_outbound
              ? ` · 自動建立 ${j.data.auto_created_outbound}`
              : ""
          }${j.data?.outbound_id ? ` · ${j.data.outbound_id}` : ""}`,
        });
        await fetcher();
      } else {
        toast({
          title: "推進失敗",
          description: j.message ?? `HTTP ${j.status}`,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "推進失敗",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setPendingId("");
    }
  };

  const nextLabelForInbound = (s: string) =>
    s === "pending" ? "→ arrived" : s === "arrived" ? "→ received" : "（完成）";
  const nextLabelForOutbound = (s: string) => {
    if (s === "ready_for_label" || s === "picking") return "→ picked";
    if (s === "picked" || s === "packing") return "→ packed";
    if (s === "packed" || s === "weighing") return "→ weight_verified";
    if (
      s === "weight_verified" ||
      s === "pending_client_label" ||
      s === "label_obtaining"
    )
      return "→ label_obtained";
    if (s === "label_obtained") return "→ label_printed";
    if (s === "label_printed") return "→ departed";
    return "（完成）";
  };

  return (
    <PageLayout
      path={[{ name: "WMS · Demo Fast-Forward", href: "#" }]}
    >
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">
              Demo Fast-Forward 控制台
            </h1>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              繞過真實 PDA 掃描 / 揀貨流程，one-click 推任何一單去下一個 stage。
              <strong>純 demo 用，會繞過 audit / notification / carrier API。</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="client_id (mongo _id)"
              className="h-8 w-[260px] font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={fetcher}>
              <IconRefresh size={14} className="mr-1.5" />
              重新整理
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[12.5px] text-destructive">
            載入失敗：{error}
          </div>
        )}
        {data?.client && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-[12.5px]">
            <strong>{data.client.code}</strong> · {data.client.email} ·{" "}
            {data.client.company_name}
          </div>
        )}

        {/* ── Inbounds ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="px-5 py-3 border-b">
            <h2 className="text-[14px] font-semibold">
              Inbound（等待入庫 / 已到 / 已上架）
              <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                · {data?.inbounds.length ?? 0} 件
              </span>
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[170px] text-xs">Inbound ID</TableHead>
                  <TableHead className="w-[100px] text-xs">Status</TableHead>
                  <TableHead className="w-[130px] text-xs">Mode</TableHead>
                  <TableHead className="w-[150px] text-xs">Tracking</TableHead>
                  <TableHead className="text-xs">Group</TableHead>
                  <TableHead className="w-[140px] text-right text-xs">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.inbounds ?? []).map((r) => {
                  const advanceable = r.status === "pending" || r.status === "arrived";
                  return (
                    <TableRow key={r._id} className="hover:bg-muted/20">
                      <TableCell className="font-mono text-[12.5px]">
                        {r._id}
                      </TableCell>
                      <TableCell className="text-[12.5px]">
                        {r.status}
                      </TableCell>
                      <TableCell className="text-[12.5px]">
                        {r.shipping_mode}
                      </TableCell>
                      <TableCell className="font-mono text-[11.5px]">
                        {r.tracking_no}
                      </TableCell>
                      <TableCell className="font-mono text-[11.5px] text-muted-foreground">
                        {r.consolidation_group_id ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!advanceable || pendingId === r._id}
                          onClick={() => advance("inbound", r._id)}
                        >
                          {pendingId === r._id ? "推進中…" : nextLabelForInbound(r.status)}
                          {advanceable && pendingId !== r._id && (
                            <IconChevronRight size={12} className="ml-1" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(data?.inbounds.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-16 text-center text-muted-foreground text-sm">
                      無 in-flight inbound
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Consolidation Groups ─────────────────────────── */}
        <Card>
          <CardHeader className="px-5 py-3 border-b">
            <h2 className="text-[14px] font-semibold">
              Consolidation Groups (pending)
              <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                · {data?.groups.length ?? 0} 組
              </span>
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[200px] text-xs">Group ID</TableHead>
                  <TableHead className="w-[100px] text-xs">Forecast</TableHead>
                  <TableHead className="text-xs">Oldest received</TableHead>
                  <TableHead className="w-[180px] text-right text-xs">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.groups ?? []).map((g) => (
                  <TableRow key={g._id} className="hover:bg-muted/20">
                    <TableCell className="font-mono text-[12.5px]">{g._id}</TableCell>
                    <TableCell className="text-[12.5px]">{g.forecast_count} 件</TableCell>
                    <TableCell className="text-[12.5px] text-muted-foreground">
                      {g.oldest_received_at
                        ? new Date(g.oldest_received_at).toLocaleString()
                        : "—（未起算）"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={pendingId === g._id}
                        onClick={() => advance("group", g._id)}
                      >
                        {pendingId === g._id ? "推進中…" : "→ force_released + 起 outbound"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.groups.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-16 text-center text-muted-foreground text-sm">
                      無 pending group
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Outbounds ────────────────────────────────────── */}
        <Card>
          <CardHeader className="px-5 py-3 border-b">
            <h2 className="text-[14px] font-semibold">
              Outbound（pick → pack → weigh → label → depart）
              <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                · {data?.outbounds.length ?? 0} 單
              </span>
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[180px] text-xs">Outbound ID</TableHead>
                  <TableHead className="w-[130px] text-xs">Status</TableHead>
                  <TableHead className="w-[80px] text-xs">Type</TableHead>
                  <TableHead className="w-[60px] text-xs">Inb</TableHead>
                  <TableHead className="w-[80px] text-xs">Weight</TableHead>
                  <TableHead className="text-xs">Tracking</TableHead>
                  <TableHead className="w-[180px] text-right text-xs">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.outbounds ?? []).map((o) => {
                  const done = o.status === "departed";
                  return (
                    <TableRow key={o._id} className="hover:bg-muted/20">
                      <TableCell className="font-mono text-[12.5px]">{o._id}</TableCell>
                      <TableCell className="text-[12.5px]">{o.status}</TableCell>
                      <TableCell className="text-[12.5px]">{o.shipment_type}</TableCell>
                      <TableCell className="text-[12.5px]">{o.inbound_count}</TableCell>
                      <TableCell className="font-mono text-[12px]">
                        {o.actual_weight_kg ? `${o.actual_weight_kg.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[11.5px] text-muted-foreground">
                        {o.tracking_no ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={done || pendingId === o._id}
                          onClick={() => advance("outbound", o._id)}
                        >
                          {pendingId === o._id ? "推進中…" : nextLabelForOutbound(o.status)}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(data?.outbounds.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-16 text-center text-muted-foreground text-sm">
                      無 in-flight outbound
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      {/* MEDIUM-007 fix — Toaster mounted locally so fast-forward mutations
          surface a visible toast (Toaster only lives on /shipments page). */}
      <Toaster />
    </PageLayout>
  );
}

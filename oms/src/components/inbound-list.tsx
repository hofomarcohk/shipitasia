"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { http_request } from "@/lib/httpRequest";
import { IconPackage } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Inbound {
  _id: string;
  warehouseCode: string;
  carrier_inbound_code: string;
  tracking_no: string;
  inbound_source: string;
  shipping_mode: string;
  declared_items_count: number;
  declared_value_total: number;
  declared_currency: string;
  status: string;
  receivedAt: string | null;
  consolidation_group_id: string | null;
  createdAt: string;
}

interface PendingGroup {
  group_id: string;
  warehouseCode: string;
  oldest_received_at_ymd: string | null;
  sweep_due_ymd: string | null;
  days_since_oldest: number | null;
  forecast_count: number;
  received_forecast_count: number;
}

const STATUS_GROUPS = {
  active: ["pending", "arrived", "received", "picking", "packed", "palletized"],
  completed: ["departed"],
  cancelled: ["cancelled", "abandoned", "expired"],
} as const;

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  arrived: "bg-blue-50 text-blue-700 border-blue-200",
  received: "bg-green-50 text-green-700 border-green-200",
  picking: "bg-purple-50 text-purple-700 border-purple-200",
  packed: "bg-purple-50 text-purple-700 border-purple-200",
  palletized: "bg-purple-50 text-purple-700 border-purple-200",
  departed: "bg-gray-100 text-gray-700 border-gray-300",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  abandoned: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-gray-50 text-gray-500 border-gray-200",
};

// Conservative client-side estimate of the next working day. The actual
// cron sweep + outbound creation date will be at least this — never
// earlier — so it's safe to surface to the customer as a promise.
function nextWorkingDayYmd(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export const InboundList = () => {
  const t = useTranslations();
  const [tab, setTab] = useState<keyof typeof STATUS_GROUPS>("active");
  const [items, setItems] = useState<Inbound[]>([]);
  const [groups, setGroups] = useState<PendingGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection across all pending groups in the active tab. Keys are
  // inbound _ids — only those that have receivedAt are togglable.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [releaseFor, setReleaseFor] = useState<PendingGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    const statuses = STATUS_GROUPS[tab].join(",");
    const [inbRes, groupRes] = await Promise.all([
      http_request("GET", "/api/cms/inbound", {
        status: statuses,
        page_size: 200,
      }),
      tab === "active"
        ? http_request("GET", "/api/cms/consolidation-groups/pending", {})
        : Promise.resolve(null as any),
    ]);
    const inbData = await inbRes.json();
    if (inbData.status === 200) setItems(inbData.data.items);
    if (groupRes) {
      const gData = await groupRes.json();
      if (gData.status === 200) setGroups(gData.data.groups ?? []);
    } else {
      setGroups([]);
    }
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tab]);

  // Map: group_id → inbounds belonging to that group within the current
  // tab's loaded items. Only managed_consign + has a group_id qualifies.
  const groupedInbounds = useMemo(() => {
    const map = new Map<string, Inbound[]>();
    for (const i of items) {
      if (
        i.shipping_mode === "managed_consign" &&
        i.consolidation_group_id &&
        groups.some((g) => g.group_id === i.consolidation_group_id)
      ) {
        const arr = map.get(i.consolidation_group_id) ?? [];
        arr.push(i);
        map.set(i.consolidation_group_id, arr);
      }
    }
    return map;
  }, [items, groups]);

  const ungrouped = useMemo(() => {
    const grouped = new Set<string>();
    for (const list of groupedInbounds.values())
      for (const i of list) grouped.add(i._id);
    return items.filter((i) => !grouped.has(i._id));
  }, [items, groupedInbounds]);

  const toggleSelect = (inboundId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(inboundId)) next.delete(inboundId);
      else next.add(inboundId);
      return next;
    });
  };

  const selectedInGroup = (g: PendingGroup): string[] => {
    const ids = groupedInbounds.get(g.group_id) ?? [];
    return ids.filter((i) => selected.has(i._id)).map((i) => i._id);
  };

  const doRelease = async () => {
    if (!releaseFor) return;
    const inbound_ids = selectedInGroup(releaseFor);
    if (inbound_ids.length === 0) return;
    setBusy(true);
    setError("");
    const r = await http_request(
      "POST",
      `/api/cms/consolidation-groups/${releaseFor.group_id}/force-release`,
      { inbound_ids }
    );
    const d = await r.json();
    setBusy(false);
    if (d.status === 200) {
      setReleaseFor(null);
      load();
    } else {
      setError(d.message || "Failed");
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <IconPackage size={28} />
            {t("inbound_v1.page_title")}
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            {t("inbound_v1.page_subtitle")}
          </p>
        </div>
        <Link href="/zh-hk/inbound/new">
          <Button>{t("inbound_v1.new_btn")}</Button>
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="active">{t("inbound_v1.tab_active")}</TabsTrigger>
          <TabsTrigger value="completed">
            {t("inbound_v1.tab_completed")}
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            {t("inbound_v1.tab_cancelled")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            {t("common.loading")}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* P14b — pending consolidation groups, each rendered as its own
              card with checkboxes + "立即出庫" action. Only on active tab. */}
          {tab === "active" &&
            groups
              .filter((g) => (groupedInbounds.get(g.group_id)?.length ?? 0) > 0)
              .map((g) => {
                const rows = groupedInbounds.get(g.group_id) ?? [];
                const selCount = selectedInGroup(g).length;
                return (
                  <Card key={g.group_id}>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            {t("inbound_v1.list.group_label")}{" "}
                            <span className="font-mono">{g.group_id}</span>
                          </span>
                          <span className="text-xs text-gray-500">
                            ·{" "}
                            {t("inbound_v1.list.group_summary", {
                              count: g.forecast_count,
                              received: g.received_forecast_count,
                            })}
                          </span>
                          {g.oldest_received_at_ymd && (
                            <span className="text-xs text-gray-500">
                              ·{" "}
                              {t("inbound_v1.list.group_oldest", {
                                date: g.oldest_received_at_ymd,
                              })}
                            </span>
                          )}
                          {g.sweep_due_ymd && (
                            <span className="text-xs text-gray-500">
                              ·{" "}
                              {t("inbound_v1.list.group_due", {
                                date: g.sweep_due_ymd,
                              })}
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={selCount > 0 ? "default" : "outline"}
                          disabled={selCount === 0}
                          onClick={() => setReleaseFor(g)}
                        >
                          {t("inbound_v1.list.release_now_btn", {
                            count: selCount,
                          })}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left border-b bg-gray-50 text-xs">
                            <th className="py-2 px-3 w-10"></th>
                            <th className="py-2 px-3">
                              {t("inbound_v1.list.id")}
                            </th>
                            <th className="py-2 px-3">
                              {t("inbound_v1.list.tracking_no")}
                            </th>
                            <th className="py-2 px-3">
                              {t("inbound_v1.list.status")}
                            </th>
                            <th className="py-2 px-3">
                              {t("inbound_v1.list.shelved_at")}
                            </th>
                            <th className="py-2 px-3 text-right">
                              {t("inbound_v1.list.items_count")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((i) => {
                            const shelved = !!i.receivedAt;
                            return (
                              <tr
                                key={i._id}
                                className="border-b hover:bg-gray-50"
                              >
                                <td className="py-2 px-3">
                                  <Checkbox
                                    checked={selected.has(i._id)}
                                    disabled={!shelved}
                                    onCheckedChange={() =>
                                      shelved && toggleSelect(i._id)
                                    }
                                  />
                                </td>
                                <td className="py-2 px-3 font-mono text-xs">
                                  <Link
                                    href={`/zh-hk/inbound/${i._id}`}
                                    className="text-blue-600 underline"
                                  >
                                    {i._id}
                                  </Link>
                                </td>
                                <td className="py-2 px-3 font-mono text-xs">
                                  {i.tracking_no}
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded border text-xs ${
                                      STATUS_CLS[i.status] ??
                                      "bg-gray-50 border-gray-200"
                                    }`}
                                  >
                                    {t(`inbound_v1.status.${i.status}` as any)}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-xs text-gray-500">
                                  {shelved
                                    ? new Date(
                                        i.receivedAt as string
                                      ).toLocaleDateString()
                                    : t("inbound_v1.list.not_shelved_yet")}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {i.declared_items_count}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                );
              })}

          <Card>
            <CardContent className="p-0">
              {ungrouped.length === 0 && groupedInbounds.size === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <IconPackage size={48} className="text-gray-300 mb-3" />
                  <p className="text-gray-600 mb-4">
                    {t("inbound_v1.empty")}
                  </p>
                  {tab === "active" && (
                    <Link href="/zh-hk/inbound/new">
                      <Button>{t("inbound_v1.empty_cta")}</Button>
                    </Link>
                  )}
                </div>
              ) : ungrouped.length === 0 ? null : (
                <div className="overflow-x-auto">
                  {groupedInbounds.size > 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-b">
                      {t("inbound_v1.list.other_inbounds")}
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b bg-gray-50">
                        <th className="py-3 px-3">{t("inbound_v1.list.id")}</th>
                        <th className="py-3 px-3">
                          {t("inbound_v1.list.carrier")}
                        </th>
                        <th className="py-3 px-3">
                          {t("inbound_v1.list.tracking_no")}
                        </th>
                        <th className="py-3 px-3">
                          {t("inbound_v1.list.shipping_mode")}
                        </th>
                        <th className="py-3 px-3 text-right">
                          {t("inbound_v1.list.items_count")}
                        </th>
                        <th className="py-3 px-3 text-right">
                          {t("inbound_v1.list.declared_value")}
                        </th>
                        <th className="py-3 px-3">
                          {t("inbound_v1.list.status")}
                        </th>
                        <th className="py-3 px-3">
                          {t("inbound_v1.list.created_at")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ungrouped.map((i) => (
                        <tr key={i._id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-3 font-mono text-xs">
                            <Link
                              href={`/zh-hk/inbound/${i._id}`}
                              className="text-blue-600 underline"
                            >
                              {i._id}
                            </Link>
                          </td>
                          <td className="py-3 px-3">
                            {i.carrier_inbound_code}
                          </td>
                          <td className="py-3 px-3 font-mono text-xs">
                            {i.tracking_no}
                          </td>
                          <td className="py-3 px-3">
                            <Badge
                              variant={
                                i.shipping_mode === "manual_consolidate"
                                  ? "secondary"
                                  : "default"
                              }
                            >
                              {t(
                                `inbound_v1.shipping_mode.${i.shipping_mode}` as any
                              )}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 text-right">
                            {i.declared_items_count}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {i.declared_currency}{" "}
                            {i.declared_value_total.toLocaleString()}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded border text-xs ${
                                STATUS_CLS[i.status] ??
                                "bg-gray-50 border-gray-200"
                              }`}
                            >
                              {t(`inbound_v1.status.${i.status}` as any)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-xs text-gray-500">
                            {new Date(i.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* P14b — confirm modal for partial force-release */}
      <AlertDialog
        open={!!releaseFor}
        onOpenChange={(open) => !open && setReleaseFor(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("inbound_v1.list.release_dialog_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {releaseFor &&
                t("inbound_v1.list.release_dialog_body", {
                  total: releaseFor.forecast_count,
                  selected: selectedInGroup(releaseFor).length,
                  due: nextWorkingDayYmd(),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("inbound_v1.list.release_dialog_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={doRelease} disabled={busy}>
              {busy
                ? t("common.loading")
                : t("inbound_v1.list.release_dialog_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

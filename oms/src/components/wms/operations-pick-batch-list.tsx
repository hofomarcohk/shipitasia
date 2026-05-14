"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

interface BatchRow {
  _id: string;
  batch_no: string;
  warehouseCode: string;
  status: string;
  outbound_ids: string[];
  note: string | null;
  createdAt: string;
}

interface OutboundCandidate {
  _id: string;
  client_id: string;
  client_code: string | null;
  carrier_code: string;
  destination_country: string;
  inbound_count: number;
  receiver_address: { name?: string; city?: string };
  createdAt: string;
}

const STATUS_TABS: { key: string; statuses: string[] }[] = [
  { key: "active", statuses: ["draft", "picking", "picked"] },
  { key: "closed", statuses: ["closed"] },
  { key: "cancelled", statuses: ["cancelled"] },
  { key: "all", statuses: [] },
];

export const OperationsPickBatchList = () => {
  const t = useTranslations();
  const [filter, setFilter] = useState("active");
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [candidates, setCandidates] = useState<OutboundCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState("");

  const loadBatches = async () => {
    const grp = STATUS_TABS.find((s) => s.key === filter);
    const params = new URLSearchParams();
    if (grp && grp.statuses.length > 0)
      params.set("status", grp.statuses.join(","));
    const r = await http_request(
      "GET",
      `/api/wms/pick-batch?${params.toString()}`,
      {}
    );
    const d = await r.json();
    if (d.status === 200) setBatches(d.data ?? []);
  };

  const loadCandidates = async () => {
    const r = await http_request("GET", `/api/wms/pick-batch/batchable`, {});
    const d = await r.json();
    if (d.status === 200) setCandidates(d.data ?? []);
  };

  useEffect(() => {
    loadBatches();
  }, [filter]);
  useEffect(() => {
    loadCandidates();
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitCreate = async () => {
    if (selected.size === 0) return;
    setCreating(true);
    const r = await http_request("POST", `/api/wms/pick-batch`, {
      outbound_ids: Array.from(selected),
      note: note || null,
    });
    const d = await r.json();
    setCreating(false);
    if (d.status === 200) {
      setSelected(new Set());
      setNote("");
      await Promise.all([loadBatches(), loadCandidates()]);
    } else {
      alert(d.message ?? "create failed");
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 grid gap-4">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t("wms_ops.pick_batch.new_section_title")}
          </h2>
          <p className="text-sm text-gray-500">
            {t("wms_ops.pick_batch.new_section_subtitle")}
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="border rounded">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-xs font-medium">
              <div className="col-span-1">
                <input
                  type="checkbox"
                  aria-label={t("wms_ops.pick_batch.select_all")}
                  checked={
                    candidates.length > 0 &&
                    selected.size === candidates.length
                  }
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        selected.size > 0 &&
                        selected.size < candidates.length;
                  }}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected(new Set(candidates.map((c) => c._id)));
                    } else {
                      setSelected(new Set());
                    }
                  }}
                />
              </div>
              <div className="col-span-2">{t("wms_ops.pick_batch.col.outbound")}</div>
              <div className="col-span-2">{t("wms_ops.pick_batch.col.client")}</div>
              <div className="col-span-2">{t("wms_ops.pick_batch.col.carrier")}</div>
              <div className="col-span-1">{t("wms_ops.pick_batch.col.dest")}</div>
              <div className="col-span-1">{t("wms_ops.pick_batch.col.inbounds")}</div>
              <div className="col-span-3">{t("wms_ops.pick_batch.col.created")}</div>
            </div>
            {candidates.length === 0 ? (
              <div className="px-3 py-6 text-sm text-gray-400">
                {t("wms_ops.pick_batch.empty_candidates")}
              </div>
            ) : (
              (() => {
                // Group by client_code (fallback to client_id) for the
                // 客人全選 layer. Order groups by code so SIA0001 shows
                // before SIA0002.
                const groupsMap = new Map<string, OutboundCandidate[]>();
                for (const c of candidates) {
                  const key = c.client_code ?? c.client_id;
                  const arr = groupsMap.get(key) ?? [];
                  arr.push(c);
                  groupsMap.set(key, arr);
                }
                const groups = Array.from(groupsMap.entries()).sort((a, b) =>
                  a[0].localeCompare(b[0])
                );
                return groups.map(([clientKey, rows]) => {
                  const ids = rows.map((r) => r._id);
                  const groupSelectedCount = ids.filter((id) =>
                    selected.has(id)
                  ).length;
                  const allSelected = groupSelectedCount === ids.length;
                  return (
                    <div key={clientKey}>
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 border-t bg-gray-100/50 items-center text-xs font-medium">
                        <div className="col-span-1">
                          <input
                            type="checkbox"
                            aria-label={t("wms_ops.pick_batch.client_select_all")}
                            checked={allSelected}
                            ref={(el) => {
                              if (el)
                                el.indeterminate =
                                  groupSelectedCount > 0 &&
                                  groupSelectedCount < ids.length;
                            }}
                            onChange={(e) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) {
                                  ids.forEach((id) => next.add(id));
                                } else {
                                  ids.forEach((id) => next.delete(id));
                                }
                                return next;
                              });
                            }}
                          />
                        </div>
                        <div className="col-span-11 font-mono">
                          {clientKey}
                          <span className="ml-2 text-gray-500 font-normal">
                            ({groupSelectedCount}/{ids.length})
                          </span>
                        </div>
                      </div>
                      {rows.map((c) => (
                        <label
                          key={c._id}
                          className="grid grid-cols-12 gap-2 px-3 py-2 border-t items-center text-sm cursor-pointer hover:bg-gray-50"
                        >
                          <div className="col-span-1 pl-4">
                            <input
                              type="checkbox"
                              checked={selected.has(c._id)}
                              onChange={() => toggle(c._id)}
                            />
                          </div>
                          <div className="col-span-2 font-mono text-xs">
                            {c._id}
                          </div>
                          <div className="col-span-2 font-mono text-xs">
                            {c.client_code ?? c.client_id}
                          </div>
                          <div className="col-span-2">{c.carrier_code}</div>
                          <div className="col-span-1">
                            {c.destination_country}
                          </div>
                          <div className="col-span-1">{c.inbound_count}</div>
                          <div className="col-span-3 text-xs text-gray-500">
                            {new Date(c.createdAt).toLocaleString()}
                          </div>
                        </label>
                      ))}
                    </div>
                  );
                });
              })()
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder={t("wms_ops.pick_batch.note_placeholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="border rounded px-3 py-2 flex-1 text-sm"
            />
            <Button
              onClick={submitCreate}
              disabled={creating || selected.size === 0}
            >
              {creating
                ? "..."
                : t("wms_ops.pick_batch.create_btn", { n: selected.size })}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_TABS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={
                  "px-3 py-1 rounded-full text-sm border " +
                  (filter === f.key
                    ? "bg-black text-white border-black"
                    : "bg-white border-gray-300 hover:bg-gray-50")
                }
              >
                {t(`wms_ops.pick_batch.filter.${f.key}` as any)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-xs font-medium">
              <div className="col-span-3">{t("wms_ops.pick_batch.col.batch_no")}</div>
              <div className="col-span-1">{t("wms_ops.pick_batch.col.status")}</div>
              <div className="col-span-1">{t("wms_ops.pick_batch.col.outbounds_count")}</div>
              <div className="col-span-3">{t("wms_ops.pick_batch.col.note")}</div>
              <div className="col-span-2">{t("wms_ops.pick_batch.col.created")}</div>
              <div className="col-span-2 text-right">{t("wms_ops.pick_batch.col.actions")}</div>
            </div>
            {batches.length === 0 ? (
              <div className="px-3 py-6 text-sm text-gray-400">
                {t("wms_ops.pick_batch.empty_batches")}
              </div>
            ) : (
              batches.map((b) => {
                const cancellable = ["draft", "picking"].includes(b.status);
                const printable = ["draft", "picking", "picked"].includes(
                  b.status
                );
                return (
                  <div
                    key={b._id}
                    className="grid grid-cols-12 gap-2 px-3 py-2 border-t items-center text-sm hover:bg-gray-50"
                  >
                    <div className="col-span-3 font-mono text-xs">
                      <Link
                        href={`/zh-hk/wms/operations/pick-batch/${b._id}`}
                        className="text-blue-700 hover:underline"
                      >
                        {b._id}
                      </Link>
                    </div>
                    <div className="col-span-1">
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100">
                        {t(`wms_ops.pick_batch.status.${b.status}` as any)}
                      </span>
                    </div>
                    <div className="col-span-1">{b.outbound_ids.length}</div>
                    <div className="col-span-3 text-gray-600 truncate">
                      {b.note ?? "—"}
                    </div>
                    <div className="col-span-2 text-xs text-gray-500">
                      {new Date(b.createdAt).toLocaleString()}
                    </div>
                    <div className="col-span-2 flex gap-1 justify-end">
                      {printable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            window.open(
                              `/zh-hk/wms/operations/pick-batch/${b._id}/print`,
                              "_blank"
                            )
                          }
                        >
                          {t("wms_ops.pick_batch.print_pick_sheet_btn")}
                        </Button>
                      )}
                      {cancellable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const reason =
                              prompt(
                                t("wms_ops.pick_batch.cancel_reason_prompt")
                              ) ?? "";
                            if (!reason) return;
                            const r = await http_request(
                              "POST",
                              `/api/wms/pick-batch/${b._id}/cancel`,
                              { reason }
                            );
                            const d = await r.json();
                            if (d.status !== 200) {
                              alert(d.message ?? "cancel failed");
                              return;
                            }
                            await loadBatches();
                            await loadCandidates();
                          }}
                        >
                          {t("wms_ops.pick_batch.cancel_btn")}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

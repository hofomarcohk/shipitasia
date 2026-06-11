// P17 — handoff #queue (任務隊列).

"use client";

import { AlertTriangle, ArrowRight, Bolt, Check, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Kpi } from "@/components/wms-redesign/kpi";
import { Pill } from "@/components/wms-redesign/pill";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { get_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";

interface QueueTask {
  id: string;
  kind: string;
  title: string;
  detail: string;
  count: number;
  urgency: "normal" | "warn" | "urgent";
  action_url: string;
}

function urgencyPill(u: QueueTask["urgency"]) {
  if (u === "urgent")
    return (
      <Pill kind="danger">
        <AlertTriangle size={11} /> 緊急
      </Pill>
    );
  if (u === "warn")
    return (
      <Pill kind="warn">
        <Clock size={11} /> 注意
      </Pill>
    );
  return null;
}

export function QueuePageClient() {
  const router = useRouter();
  const [tasks, setTasks] = React.useState<QueueTask[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await get_request("/api/wms/queue");
        const json = await res.json();
        if (cancelled) return;
        if (json?.status === 200) setTasks(json.data?.tasks ?? []);
        else setError(json?.message ?? "Load failed");
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = React.useMemo(() => {
    const c = { urgent: 0, warn: 0, normal: 0, total: tasks.length };
    for (const t of tasks) c[t.urgency] += 1;
    return c;
  }, [tasks]);

  return (
    <WmsShell crumbs={[{ label: "任務隊列" }]}>
      <div className="px-[22px] py-3.5">
        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="font-wms-disp text-[24px] font-extrabold tracking-tight">
            任務隊列
          </h1>
          <Pill kind="muted">
            <span className="font-wms-mono">{counts.total}</span> 件待辦
          </Pill>
        </div>

        {error && (
          <div className="mb-3 rounded-[3px] bg-wms-danger px-3 py-2 text-[13px] font-semibold text-white">
            {error}
          </div>
        )}

        <div className="mb-4 flex gap-2.5">
          <Kpi
            icon={<AlertTriangle size={18} />}
            n={counts.urgent}
            lbl="緊急"
          />
          <Kpi icon={<Clock size={18} />} n={counts.warn} lbl="注意" />
          <Kpi icon={<Check size={18} />} n={counts.normal} lbl="待辦" />
        </div>

        <div className="rounded-xl border border-wms-border bg-wms-surface p-2.5">
          {tasks.length === 0 ? (
            <div className="rounded-md bg-wms-surface-alt p-8 text-center text-sm text-wms-faint">
              今日任務已全部完成 · 可稍作休息
            </div>
          ) : (
            tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => router.push(t.action_url)}
                className="flex w-full items-center gap-3.5 rounded-[10px] border border-transparent p-3 text-left transition-colors hover:bg-wms-row-hover"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 flex-none items-center justify-center rounded-full font-wms-mono font-semibold",
                    t.urgency === "urgent"
                      ? "bg-wms-danger-bg text-wms-danger-fg"
                      : t.urgency === "warn"
                        ? "bg-wms-warn-bg text-wms-warn-fg"
                        : "bg-wms-surface-alt text-wms-muted"
                  )}
                >
                  {t.count}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold">
                      {t.title}
                    </span>
                    {urgencyPill(t.urgency)}
                  </div>
                  <div className="mt-0.5 text-xs text-wms-muted">
                    {t.detail}
                  </div>
                </div>
                <ArrowRight size={15} className="text-wms-faint" />
              </button>
            ))
          )}
        </div>
      </div>
    </WmsShell>
  );
}
